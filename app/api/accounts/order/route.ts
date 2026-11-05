import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/mongodb";
import { requireUid } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

/** Saves the order the user chose: each account gets its index as sortOrder. */
export async function PUT(req: Request) {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;
  const uid = auth;

  let ids: string[];
  try {
    ids = bodySchema.parse(await req.json()).ids;
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Cuentas repetidas" }, { status: 400 });
  }

  const db = await getDb();
  // Filter by userId so a user can only reorder their own accounts.
  await db.collection("accounts").bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { id, userId: uid }, update: { $set: { sortOrder: index } } },
    })),
    { ordered: false },
  );
  return NextResponse.json({ ok: true });
}
