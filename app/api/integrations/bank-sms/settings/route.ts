import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/mongodb";
import { requireUid } from "@/lib/api-auth";
import {
  generateToken,
  getBankSmsDoc,
  hashToken,
  ingestSms,
  publicBankSmsConfig,
  removePending,
} from "@/lib/integrations/bank-sms-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(publicBankSmsConfig(await getBankSmsDoc(auth)));
}

/** Creates (or rotates) the personal token. The plain token is returned only here. */
export async function POST() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  const token = generateToken();
  const db = await getDb();
  await db.collection("users").updateOne(
    { id: auth },
    { $set: { "bankSms.tokenHash": hashToken(token), "bankSms.tokenCreatedAt": new Date().toISOString() } },
  );
  return NextResponse.json({ token, ...publicBankSmsConfig(await getBankSmsDoc(auth)) });
}

const patchSchema = z.object({
  /** "*1234" in the SMS → accountId; null removes the mapping. */
  product: z.object({ last4: z.string().regex(/^\d{4}$/), accountId: z.string().min(1).nullable() }).optional(),
  /** Number typed by the user before any SMS mentioned it: keep it listed. */
  addProduct: z.string().regex(/^\d{4}$/).optional(),
  /** Pending SMS to process again (after mapping its account) or to discard. */
  retryPendingId: z.string().min(1).optional(),
  dismissPendingId: z.string().min(1).optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;
  const uid = auth;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const db = await getDb();
  let message: string | undefined;

  if (body.product) {
    const { last4, accountId } = body.product;
    if (accountId) {
      const exists = await db.collection("accounts").countDocuments({ userId: uid, id: accountId });
      if (!exists) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      await db.collection("users").updateOne(
        { id: uid },
        { $set: { [`bankSms.accountMap.${last4}`]: accountId }, $addToSet: { "bankSms.seenProducts": last4 } },
      );
    } else {
      await db.collection("users").updateOne({ id: uid }, { $unset: { [`bankSms.accountMap.${last4}`]: "" } });
    }
  }

  if (body.addProduct) {
    await db.collection("users").updateOne({ id: uid }, { $addToSet: { "bankSms.seenProducts": body.addProduct } });
  }

  if (body.dismissPendingId) await removePending(uid, body.dismissPendingId);

  if (body.retryPendingId) {
    const pending = (await getBankSmsDoc(uid)).pending?.find((p) => p.id === body.retryPendingId);
    if (!pending) return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    await removePending(uid, pending.id);
    // A failed retry puts the SMS back in pending with the new reason.
    message = (await ingestSms(uid, pending.text)).message;
  }

  return NextResponse.json({ ...publicBankSmsConfig(await getBankSmsDoc(uid)), message });
}

/** Revokes the token: the Shortcut stops working until a new one is created. */
export async function DELETE() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  const db = await getDb();
  await db
    .collection("users")
    .updateOne({ id: auth }, { $unset: { "bankSms.tokenHash": "", "bankSms.tokenCreatedAt": "" } });
  return NextResponse.json(publicBankSmsConfig(await getBankSmsDoc(auth)));
}
