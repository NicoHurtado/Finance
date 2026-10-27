import { NextResponse } from "next/server";
import { requireUid } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

declare global {
  var _trmCache: { rate: number; date: string; fetchedAt: number } | null;
}
global._trmCache ??= null;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

interface Rate { rate: number; date: string; source: string }

// TRM oficial — Superintendencia Financiera vía datos.gov.co
async function fetchOfficialTrm(): Promise<Rate> {
  const res = await fetch(
    "https://www.datos.gov.co/resource/mcec-87by.json?$limit=1&$order=vigenciadesde+DESC",
    { cache: "no-store", signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error("Empty response");
  const rate = parseFloat(data[0].valor);
  const date: string = data[0].vigenciadesde?.slice(0, 10) ?? "";
  if (!(rate > 0)) throw new Error("Invalid rate value");
  return { rate, date, source: "trm" };
}

// Respaldo: tasa de mercado USD→COP (no es la TRM oficial, pero difiere muy poco).
async function fetchMarketRate(): Promise<Rate> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.rates?.COP);
  if (!(rate > 0)) throw new Error("Invalid rate value");
  const updated = data.time_last_update_unix
    ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return { rate, date: updated, source: "market" };
}

export async function GET() {
  const auth = await requireUid();
  if (auth instanceof NextResponse) return auth;

  const cache = global._trmCache;
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ rate: cache.rate, date: cache.date, source: "cache" });
  }
  for (const source of [fetchOfficialTrm, fetchMarketRate]) {
    try {
      const { rate, date, source: name } = await source();
      global._trmCache = { rate, date, fetchedAt: Date.now() };
      return NextResponse.json({ rate, date, source: name });
    } catch (err) {
      console.error(`[exchange-rate] ${source.name} failed:`, err);
    }
  }
  // Both sources down: a stale rate beats none (USD would be summed as COP).
  if (cache) {
    return NextResponse.json({ rate: cache.rate, date: cache.date, source: "stale" });
  }
  return NextResponse.json({ error: "No se pudo obtener la TRM" }, { status: 503 });
}
