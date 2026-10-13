import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { getDb } from "@/lib/db/mongodb";
import { withRetry } from "@/lib/db/retry";
import { getCategories } from "@/lib/db/queries";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseTransaction } from "@/lib/finance/transaction-validation";
import { formatMoney } from "@/lib/finance/format";
import { guessCategory, parseAmount, resolveAccount } from "@/lib/integrations/apple-pay";
import { findUserByToken } from "@/lib/integrations/apple-pay-server";
import type { Account, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Webhook for the iOS Shortcuts "Transaction" automation: every Apple Pay
 * payment POSTs { amount, merchant, card } here with a personal Bearer token
 * (the Shortcut has no session cookie). Responses carry a human `message` the
 * Shortcut can show as a notification.
 */
const bodySchema = z.object({
  amount: z.union([z.string(), z.number()]),
  merchant: z.string().trim().max(200).optional(),
  card: z.string().trim().max(200).optional(),
  /** Optional free text, e.g. the Wallet transaction "Name". */
  name: z.string().trim().max(200).optional(),
});

/** Same amount + merchant within this window is treated as a repeated firing. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message, message }, { status });
}

export async function POST(req: Request) {
  const limit = rateLimit(`${clientIp(req)}:apple-pay`, 30, 60_000);
  if (!limit.ok) return fail("Demasiadas solicitudes, intenta en un momento", 429);

  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail("Falta el token de Apple Pay", 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("JSON inválido", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("Datos inválidos: se requiere amount", 400);
  const { merchant, card, name } = parsed.data;

  const amount = parseAmount(parsed.data.amount);
  if (amount === null) return fail(`No pude leer el monto "${parsed.data.amount}"`, 400);

  type Outcome =
    | { kind: "error"; response: NextResponse }
    | { kind: "duplicate"; account: Account; description: string }
    | { kind: "created"; account: Account; tx: Transaction };

  const outcome = await withRetry(async (): Promise<Outcome> => {
    const user = await findUserByToken(token);
    if (!user) return { kind: "error", response: fail("Token inválido o revocado", 401) };
    const uid = user.id;
    const config = {
      cardMap: user.applePay?.cardMap ?? {},
      defaultAccountId: user.applePay?.defaultAccountId,
    };

    const db = await getDb();
    const accounts = await db
      .collection<Account & { userId: string }>("accounts")
      .find({ userId: uid }, { projection: { _id: 0, syncToken: 0 } })
      .toArray();

    // Remember card names so they show up in the mapping UI.
    const now = new Date();
    await db.collection("users").updateOne(
      { id: uid },
      {
        $set: { "applePay.lastEventAt": now.toISOString() },
        ...(card ? { $addToSet: { "applePay.seenCards": card } } : {}),
      },
    );

    const account = resolveAccount(card, accounts, config);
    if (!account) {
      return {
        kind: "error",
        response: fail(
          `No sé a qué cuenta va la tarjeta "${card ?? "desconocida"}". Asígnala en Cuentas → Apple Pay.`,
          422,
        ),
      };
    }

    // Shortcuts can fire twice for one tap; skip an identical recent expense.
    const description = merchant || name || "Apple Pay";
    const duplicate = await db.collection("transactions").findOne({
      userId: uid,
      accountId: account.id,
      kind: "expense",
      amount,
      description,
      occurredAt: { $gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString() },
    });
    if (duplicate) return { kind: "duplicate", account, description };

    const categories = (await getCategories()).map((c) => c.name);
    const tx = parseTransaction({
      id: uuid(),
      accountId: account.id,
      kind: "expense",
      amount,
      category: guessCategory(merchant || name, categories),
      description,
      occurredAt: now.toISOString(),
    });
    await db.collection("transactions").insertOne({ ...tx, userId: uid });
    return { kind: "created", account, tx };
  });

  if (outcome.kind === "error") return outcome.response;
  const money = formatMoney(amount, outcome.account.currency);
  if (outcome.kind === "duplicate") {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      message: `Ya estaba registrado: ${money} en ${outcome.description}`,
    });
  }
  const { tx, account } = outcome;
  return NextResponse.json(
    {
      ok: true,
      transaction: tx,
      message: `Guardado: ${money} en ${tx.description} · ${account.name} · ${tx.category}`,
    },
    { status: 201 },
  );
}
