import { NextResponse } from "next/server";
import { requireUid } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

declare global {
  var _trmCache: { rate: number; date: string; fetchedAt: number } | null;
}
global._trmCache ??= null;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  const cache = global._trmCache;
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ rate: cache.rate, date: cache.date, source: "cache" });
  }
  try {
    // TRM oficial — Superintendencia Financiera vía datos.gov.co
    const res = await fetch(
      "https://www.datos.gov.co/resource/mcec-87by.json?$limit=1&$order=vigenciadesde+DESC",
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Empty response");
    const rate = parseFloat(data[0].valor);
    const date: string = data[0].vigenciadesde?.slice(0, 10) ?? "";
    if (isNaN(rate)) throw new Error("Invalid rate value");
    global._trmCache = { rate, date, fetchedAt: Date.now() };
    return NextResponse.json({ rate, date });
  } catch {
    // Upstream down or slow: a stale TRM beats none (USD would be summed as COP).
    if (cache) {
      return NextResponse.json({ rate: cache.rate, date: cache.date, source: "stale" });
    }
    return NextResponse.json({ error: "No se pudo obtener la TRM" }, { status: 503 });
  }
}
