import "server-only";
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "financepro";

if (!uri) {
  throw new Error("MONGODB_URI is not set");
}

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoIndexesReady: Promise<void> | undefined;
}

function newClientPromise(): Promise<MongoClient> {
  return (global._mongoClientPromise = new MongoClient(uri!, {
    maxPoolSize: 10,
    // Let idle serverless instances release every connection. With two users,
    // keeping a permanent minimum pool provides no meaningful latency benefit.
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    // Cold serverless starts need room for DNS SRV + TLS + SCRAM (and an Atlas
    // tier that may be waking). 5s was too tight and made the first request of
    // the day fail; the retry then hit a warm client and succeeded.
    serverSelectionTimeoutMS: 15_000,
    retryWrites: true,
  })
    .connect()
    .catch((err) => {
      // Never cache a rejected promise: a poisoned global would make every
      // later request on this instance re-throw the same failure forever.
      global._mongoClientPromise = undefined;
      throw err;
    }));
}

// Kick off the connection at module load, but resolve it through the global on
// each call so that after a cleared (rejected) promise we reconnect cleanly
// instead of forever awaiting the original failed attempt.
if (!global._mongoClientPromise) newClientPromise();

// Build indexes once per process, in the background — never blocks a request.
// Each index is created independently so a name/spec conflict on one
// (e.g. an equivalent index built earlier under a different name) never
// prevents the others from being created.
async function ensureIndexes(db: Db): Promise<void> {
  const jobs: Array<Promise<unknown>> = [
    // All data queries are scoped by userId, so userId leads every index.
    db.collection("transactions").createIndex(
      { userId: 1, occurredAt: -1 },
      { name: "userId_occurredAt_desc" },
    ),
    db.collection("transactions").createIndex({ userId: 1, id: 1 }, { name: "userId_id" }),
    db.collection("transactions").createIndex(
      { userId: 1, accountId: 1, occurredAt: -1 },
      { name: "userId_accountId_occurredAt_desc" },
    ),
    // Single composite index serves both lookups by userId and by {userId,id}.
    // A standalone {userId:1} index would be redundant (it's a prefix of this one).
    db.collection("accounts").createIndex({ userId: 1, id: 1 }, { name: "userId_id" }),
    // Preferences are embedded in the user doc (1:1) — no separate settings collection.
    // Name left to Mongo's default ("username_1") so this matches the live unique
    // index exactly and stays a true no-op instead of conflicting on every cold start.
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    // The app resolves the current user by their `id` (session uid) on every page
    // load (settings, name, preferences). Without this index that read is a
    // collection scan; `id` is the user's unique primary key.
    db.collection("users").createIndex({ id: 1 }, { unique: true }),
    db.collection("subscriptions").createIndex({ userId: 1, id: 1 }, { name: "userId_id" }),
    // Cron sweep filters active due subscriptions across all users by billing day.
    db.collection("subscriptions").createIndex(
      { active: 1, billingDay: 1 },
      { name: "active_billingDay" },
    ),
  ];
  await Promise.allSettled(jobs);
}

export async function getDb(): Promise<Db> {
  const client = await (global._mongoClientPromise ?? newClientPromise());
  const db = client.db(dbName);
  // Fire-and-forget: indexes build in the background, requests don't wait.
  global._mongoIndexesReady ??= ensureIndexes(db).catch((e) => {
    console.error("[mongodb] ensureIndexes failed", e);
    global._mongoIndexesReady = undefined;
  });
  return db;
}
