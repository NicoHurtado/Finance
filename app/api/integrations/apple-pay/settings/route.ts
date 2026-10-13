import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/mongodb";
import { requireUid } from "@/lib/api-auth";
import { cardKey } from "@/lib/integrations/apple-pay";
import {
  generateToken,
  getApplePayDoc,
  hashToken,
  publicApplePayConfig,
} from "@/lib/integrations/apple-pay-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(publicApplePayConfig(await getApplePayDoc(auth)));
}

/** Creates (or rotates) the personal token. The plain token is returned only here. */
export async function POST() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  const token = generateToken();
  const db = await getDb();
  await db.collection("users").updateOne(
    { id: auth },
    {
      $set: {
        "applePay.tokenHash": hashToken(token),
        "applePay.tokenCreatedAt": new Date().toISOString(),
      },
    },
  );
  return NextResponse.json({ token, ...publicApplePayConfig(await getApplePayDoc(auth)) });
}

const patchSchema = z.object({
  /** Wallet card name → accountId; null removes the mapping. */
  card: z.object({ name: z.string().trim().min(1), accountId: z.string().min(1).nullable() }).optional(),
  defaultAccountId: z.string().min(1).nullable().optional(),
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
  const accountIds = [body.card?.accountId, body.defaultAccountId].filter(
    (id): id is string => typeof id === "string",
  );
  if (accountIds.length > 0) {
    const count = await db.collection("accounts").countDocuments({ userId: uid, id: { $in: accountIds } });
    if (count !== new Set(accountIds).size) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (body.card) {
    const key = `applePay.cardMap.${cardKey(body.card.name)}`;
    if (body.card.accountId) set[key] = body.card.accountId;
    else unset[key] = "";
  }
  if (body.defaultAccountId !== undefined) {
    if (body.defaultAccountId) set["applePay.defaultAccountId"] = body.defaultAccountId;
    else unset["applePay.defaultAccountId"] = "";
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;
  if (Object.keys(update).length > 0) {
    await db.collection("users").updateOne({ id: uid }, update);
  }

  return NextResponse.json(publicApplePayConfig(await getApplePayDoc(uid)));
}

/** Revokes the token: the Shortcut stops working until a new one is created. */
export async function DELETE() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  const db = await getDb();
  await db
    .collection("users")
    .updateOne({ id: auth }, { $unset: { "applePay.tokenHash": "", "applePay.tokenCreatedAt": "" } });
  return NextResponse.json(publicApplePayConfig(await getApplePayDoc(auth)));
}
