"use client";
import { create } from "zustand";

const STORAGE_KEY = "coffee_trm";
const today = () => new Date().toISOString().slice(0, 10);

interface Cached { rate: number; date: string; fetchedOn: string }

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: Cached = JSON.parse(raw);
    if (typeof parsed.rate !== "number" || !(parsed.rate > 0)) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(rate: number, date: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rate, date, fetchedOn: today() }));
  } catch { /* ignore */ }
}

interface State {
  usdToCop: number | null;
  trmDate: string | null;
  loaded: boolean;
  hydrate: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useExchangeRateStore = create<State>()((set, get) => ({
  usdToCop: null,
  trmDate: null,
  loaded: false,
  hydrate: () => {
    if (get().loaded) return Promise.resolve();
    // Use cached value if already fetched today
    const cached = readCache();
    if (cached?.fetchedOn === today()) {
      set({ usdToCop: cached.rate, trmDate: cached.date, loaded: true });
      return Promise.resolve();
    }
    // A stale rate is far closer to reality than treating USD as COP, so show it
    // while we try to refresh.
    if (cached && get().usdToCop == null) {
      set({ usdToCop: cached.rate, trmDate: cached.date });
    }
    inFlight ??= (async () => {
      try {
        const res = await fetch("/api/exchange-rate", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.rate) {
          writeCache(data.rate, data.date ?? today());
          set({ usdToCop: data.rate, trmDate: data.date ?? null, loaded: true });
        }
        // On failure leave loaded=false so DataHydrator keeps retrying.
      } catch {
        /* retried by DataHydrator */
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
}));
