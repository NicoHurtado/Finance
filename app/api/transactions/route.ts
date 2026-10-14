import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db/mongodb";
import { withRetry } from "@/lib/db/retry";
import { getTransactionsForUser } from "@/lib/db/queries";
import type { Transaction } from "@/lib/types";
import { requireUid } from "@/lib/api-auth";
import { ZodError } from "zod";
import { parseTransaction } from "@/lib/finance/transaction-validation";
import { isValidTransferPair } from "@/lib/finance/transactions";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;
  const uid = auth;

  return NextResponse.json(await getTransactionsForUser(uid));
}

export async function POST(req: Request) {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;
  const uid = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const values = Array.isArray(body) ? body : [body];
  if (values.length === 0) {
    return NextResponse.json({ error: "No hay transacciones para guardar" }, { status: 400 });
  }
  let transactions: Transaction[];
  try {
    transactions = values.map((value) =>
      parseTransaction({ ...(value as object), id: (value as Partial<Transaction>).id ?? uuid() }),
    );
  } catch (error) {
    const details = error instanceof ZodError ? error.issues : undefined;
    return NextResponse.json({ error: "Transacción inválida", details }, { status: 400 });
  }

  const isBatch = Array.isArray(body);
  const transferBatch = transactions.some((tx) => tx.kind === "transfer");
  if (transferBatch && (!isBatch || transactions.length !== 2 || transactions.some((tx) => tx.kind !== "transfer"))) {
    return NextResponse.json({ error: "Un traslado debe contener exactamente dos movimientos" }, { status: 400 });
  }

  const docs = transactions.map((tx) => ({ ...tx, userId: uid }));
  // Cold serverless start: the very first connect of the day can be slow or
  // transiently fail. Retry once so it's invisible to the user instead of
  // surfacing as a "check your connection" error.
  try {
    await withRetry(async () => {
      const db = await getDb();
      const accountIds = [...new Set(transactions.map((tx) => tx.accountId))];
      const accounts = await db
        .collection<Account & { userId: string }>("accounts")
        .find({ id: { $in: accountIds }, userId: uid })
        .toArray();
      if (accounts.length !== accountIds.length) throw new Error("ACCOUNT_NOT_FOUND");
      if (transactions.some((tx) => tx.kind === "adjustment" && accounts.find((a) => a.id === tx.accountId)?.type !== "investment")) {
        throw new Error("INVALID_ADJUSTMENT");
      }
      if (transactions.some((tx) => tx.installments && accounts.find((a) => a.id === tx.accountId)?.type !== "credit")) {
        throw new Error("INVALID_INSTALLMENTS");
      }
      if (transferBatch) {
        const [first, second] = transactions;
        if (!isValidTransferPair([first, second], accounts)) throw new Error("INVALID_TRANSFER_PAIR");
      }
      await db.collection("transactions").insertMany(docs);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVALID_TRANSFER_PAIR") {
      return NextResponse.json({ error: "Las dos partes del traslado no cuadran" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_INSTALLMENTS") {
      return NextResponse.json({ error: "Solo las compras con tarjeta de crédito se pueden diferir a cuotas" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_ADJUSTMENT") {
      return NextResponse.json({ error: "Los ajustes absolutos solo aplican a inversiones" }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json(isBatch ? transactions : transactions[0], { status: 201 });
}
