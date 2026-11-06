import "server-only";
import { createHash, randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db/mongodb";
import { getCategories } from "@/lib/db/queries";
import { formatMoney } from "@/lib/finance/format";
import { parseTransaction } from "@/lib/finance/transaction-validation";
import { transferDirectionFor } from "@/lib/finance/transactions";
import type { Account, Transaction } from "@/lib/types";
import { guessCategory, parseBankSms, resolveAccountByLast4, smsFingerprint } from "./bank-sms";

/** An SMS the app could not turn into a movement, kept for the user to review. */
export interface PendingSms {
  id: string;
  text: string;
  receivedAt: string;
  reason: string;
  /** Last 4 digits read from the SMS, so the UI can offer to map them. */
  last4?: string;
}

/**
 * Stored embedded in the user doc (1:1), like preferences. Only the SHA-256
 * of the token is kept: the plain token is shown once when generated.
 */
export interface BankSmsDoc {
  tokenHash?: string;
  tokenCreatedAt?: string;
  /** "1234" (last 4 digits in the SMS) → accountId. */
  accountMap?: Record<string, string>;
  /** Last 4 digits seen in incoming SMS, so the UI can map them. */
  seenProducts?: string[];
  lastEventAt?: string;
  pending?: PendingSms[];
}

interface UserWithBankSms {
  id: string;
  bankSms?: BankSmsDoc;
}

const MAX_PENDING = 30;

export function generateToken(): string {
  return `cof_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function findUserByToken(token: string): Promise<UserWithBankSms | null> {
  if (!token.startsWith("cof_")) return null;
  const db = await getDb();
  return db
    .collection<UserWithBankSms>("users")
    .findOne({ "bankSms.tokenHash": hashToken(token) }, { projection: { _id: 0, id: 1, bankSms: 1 } });
}

export async function getBankSmsDoc(uid: string): Promise<BankSmsDoc> {
  const db = await getDb();
  const user = await db
    .collection<UserWithBankSms>("users")
    .findOne({ id: uid }, { projection: { _id: 0, bankSms: 1 } });
  return user?.bankSms ?? {};
}

/** Client-safe view: never exposes the token hash. */
export function publicBankSmsConfig(doc: BankSmsDoc) {
  return {
    enabled: Boolean(doc.tokenHash),
    tokenCreatedAt: doc.tokenCreatedAt,
    accountMap: doc.accountMap ?? {},
    seenProducts: doc.seenProducts ?? [],
    lastEventAt: doc.lastEventAt,
    pending: [...(doc.pending ?? [])].reverse(),
  };
}

export type PublicBankSmsConfig = ReturnType<typeof publicBankSmsConfig>;

export type IngestResult =
  | { status: "created"; transactions: Transaction[]; message: string }
  | { status: "duplicate"; message: string }
  | { status: "ignored"; message: string }
  | { status: "pending"; message: string };

function pickCategory(preferred: string[], available: string[]): string {
  return preferred.find((c) => available.includes(c)) ?? "Otro";
}

async function addPending(uid: string, text: string, reason: string, last4?: string | null) {
  const db = await getDb();
  const doc = await getBankSmsDoc(uid);
  const fingerprint = smsFingerprint(text);
  // Same SMS forwarded again: keep a single entry, with the newest reason.
  const others = (doc.pending ?? []).filter((p) => smsFingerprint(p.text) !== fingerprint);
  const entry: PendingSms = {
    id: uuid(),
    text,
    receivedAt: new Date().toISOString(),
    reason,
    ...(last4 ? { last4 } : {}),
  };
  await db
    .collection("users")
    .updateOne({ id: uid }, { $set: { "bankSms.pending": [...others, entry].slice(-MAX_PENDING) } });
}

export async function removePending(uid: string, id: string) {
  const db = await getDb();
  await db
    .collection<UserWithBankSms>("users")
    .updateOne({ id: uid }, { $pull: { "bankSms.pending": { id } } });
}

/**
 * Turns one bank SMS into movements for `uid`:
 *  - purchases / withdrawals → expense
 *  - money received → income
 *  - transfers / payments → internal transfer when the destination is one of
 *    the user's accounts, otherwise an expense
 * Anything that can't be read or matched to an account is kept as pending.
 */
export async function ingestSms(uid: string, text: string): Promise<IngestResult> {
  const db = await getDb();
  const now = new Date();
  const config = await getBankSmsDoc(uid);
  const sms = parseBankSms(text, now);

  await db.collection("users").updateOne(
    { id: uid },
    {
      $set: { "bankSms.lastEventAt": now.toISOString() },
      ...(sms?.accountLast4 ? { $addToSet: { "bankSms.seenProducts": sms.accountLast4 } } : {}),
    },
  );

  if (!sms) {
    // OTP codes, marketing… are expected: only keep texts that look like money moved.
    if (/\$|COP|USD/i.test(text)) {
      await addPending(uid, text, "No reconocí el formato del mensaje");
      return { status: "pending", message: "No entendí este mensaje. Quedó en pendientes." };
    }
    return { status: "ignored", message: "Mensaje ignorado: no es un movimiento" };
  }

  const fingerprint = smsFingerprint(text);
  const events = db.collection("sms_events");
  if (await events.findOne({ userId: uid, fingerprint })) {
    return { status: "duplicate", message: "Este mensaje ya estaba registrado" };
  }

  const accounts = await db
    .collection<Account & { userId: string }>("accounts")
    .find({ userId: uid }, { projection: { _id: 0, userId: 0, syncToken: 0 } })
    .toArray();
  const accountMap = config.accountMap ?? {};
  const account = resolveAccountByLast4(sms.accountLast4, accounts, accountMap);
  if (!account) {
    const ref = sms.accountLast4 ? `*${sms.accountLast4}` : "sin número";
    await addPending(uid, text, `No sé a qué cuenta va el producto ${ref}`, sms.accountLast4);
    return {
      status: "pending",
      message: `No sé a qué cuenta va ${ref}. Asígnala en Cuentas → Mensajes del banco.`,
    };
  }
  if (sms.currency !== account.currency) {
    await addPending(uid, text, `El movimiento es en ${sms.currency} y ${account.name} está en ${account.currency}`);
    return { status: "pending", message: `Movimiento en ${sms.currency}: revísalo en pendientes.` };
  }

  const categories = (await getCategories()).map((c) => c.name);
  const occurredAt = sms.occurredAt;
  let transactions: Transaction[];

  const destination =
    sms.kind === "transfer" ? resolveAccountByLast4(sms.counterpartLast4, accounts, accountMap) : null;
  // Money leaving a savings product (Fiducuenta, CDT, inversión) to one of the
  // user's accounts becomes a transfer below; to an account they don't have
  // registered (e.g. paying someone), it is recorded as money that left it.
  if (destination && destination.id !== account.id && destination.currency === account.currency) {
    const pairId = `pair-${uuid()}`;
    transactions = [
      parseTransaction({
        id: uuid(),
        accountId: account.id,
        kind: "transfer",
        direction: transferDirectionFor(account.type, "source"),
        amount: sms.amount,
        category: "Traslado",
        description: `Traslado a ${destination.name}`,
        occurredAt,
        transferPairId: pairId,
      }),
      parseTransaction({
        id: uuid(),
        accountId: destination.id,
        kind: "transfer",
        direction: transferDirectionFor(destination.type, "destination"),
        amount: sms.amount,
        category: "Traslado",
        description: `Traslado desde ${account.name}`,
        occurredAt,
        transferPairId: pairId,
      }),
    ];
  } else {
    const kind = sms.kind === "income" ? "income" : "expense";
    const category =
      sms.kind === "income"
        ? pickCategory(["Salario", "Ingresos", "Ingreso", "Otro"], categories)
        : sms.kind === "transfer"
          ? guessCategory(sms.merchant, categories, pickCategory(["Transferencias", "Transferencia", "Otro"], categories))
          : guessCategory(sms.merchant, categories);
    transactions = [
      parseTransaction({
        id: uuid(),
        accountId: account.id,
        kind,
        amount: sms.amount,
        category,
        description: sms.description,
        occurredAt,
      }),
    ];
  }

  // Claim the SMS first so two concurrent deliveries can't both insert.
  try {
    await events.insertOne({
      userId: uid,
      fingerprint,
      transactionIds: transactions.map((t) => t.id),
      createdAt: now.toISOString(),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { status: "duplicate", message: "Este mensaje ya estaba registrado" };
    }
    throw error;
  }
  try {
    await db.collection("transactions").insertMany(transactions.map((t) => ({ ...t, userId: uid })));
  } catch (error) {
    await events.deleteOne({ userId: uid, fingerprint });
    throw error;
  }

  const money = formatMoney(sms.amount, account.currency);
  const [first] = transactions;
  const message =
    transactions.length === 2
      ? `Traslado: ${money} de ${account.name} a ${destination?.name}`
      : `${first.kind === "income" ? "Ingreso" : "Gasto"}: ${money} · ${first.description} · ${account.name} · ${first.category}`;
  return { status: "created", transactions, message };
}
