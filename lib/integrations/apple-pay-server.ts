import "server-only";
import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db/mongodb";
import type { ApplePayConfig } from "./apple-pay";

/**
 * Stored embedded in the user doc (1:1), like preferences. Only the SHA-256
 * of the token is kept: the plain token is shown once when generated.
 */
export interface ApplePayDoc extends ApplePayConfig {
  tokenHash?: string;
  tokenCreatedAt?: string;
  /** Wallet card names seen in incoming payments, so the UI can map them. */
  seenCards?: string[];
  lastEventAt?: string;
}

export interface UserWithApplePay {
  id: string;
  applePay?: ApplePayDoc;
}

export function generateToken(): string {
  return `cof_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function findUserByToken(token: string): Promise<UserWithApplePay | null> {
  if (!token.startsWith("cof_")) return null;
  const db = await getDb();
  return db
    .collection<UserWithApplePay>("users")
    .findOne(
      { "applePay.tokenHash": hashToken(token) },
      { projection: { _id: 0, id: 1, applePay: 1 } },
    );
}

export async function getApplePayDoc(uid: string): Promise<ApplePayDoc> {
  const db = await getDb();
  const user = await db
    .collection<UserWithApplePay>("users")
    .findOne({ id: uid }, { projection: { _id: 0, applePay: 1 } });
  return user?.applePay ?? { cardMap: {} };
}

/** Client-safe view: never exposes the token hash. */
export function publicApplePayConfig(doc: ApplePayDoc) {
  return {
    enabled: Boolean(doc.tokenHash),
    tokenCreatedAt: doc.tokenCreatedAt,
    cardMap: doc.cardMap ?? {},
    defaultAccountId: doc.defaultAccountId,
    seenCards: doc.seenCards ?? [],
    lastEventAt: doc.lastEventAt,
  };
}

export type PublicApplePayConfig = ReturnType<typeof publicApplePayConfig>;
