"use client";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAccountsStore } from "@/lib/store/accounts";
import { useTransactionsStore } from "@/lib/store/transactions";
import { useSettingsStore } from "@/lib/store/settings";
import { useCategoriesStore } from "@/lib/store/categories";
import { useExchangeRateStore } from "@/lib/store/exchange-rate";
import { useSubscriptionsStore } from "@/lib/store/subscriptions";

export function DataHydrator() {
  const hydrateAccounts = useAccountsStore((s) => s.hydrate);
  const hydrateTxs = useTransactionsStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateCategories = useCategoriesStore((s) => s.hydrate);
  const hydrateExchangeRate = useExchangeRateStore((s) => s.hydrate);
  const hydrateSubscriptions = useSubscriptionsStore((s) => s.hydrate);

  useEffect(() => {
    function hydrateAll() {
      // Each hydrate() is a no-op once its store is loaded, so this is cheap.
      void hydrateAccounts();
      void hydrateTxs();
      void hydrateSettings();
      void hydrateCategories();
      void hydrateExchangeRate();
      void hydrateSubscriptions();
    }

    hydrateAll();

    // Self-heal: if a load failed (e.g. DB was unreachable), keep retrying every
    // 10s until every store is loaded, then stop. Recovers without a manual reload.
    const interval = setInterval(() => {
      const allLoaded =
        useAccountsStore.getState().loaded &&
        useTransactionsStore.getState().loaded &&
        useSettingsStore.getState().loaded &&
        useCategoriesStore.getState().loaded &&
        useExchangeRateStore.getState().loaded &&
        useSubscriptionsStore.getState().loaded;
      if (allLoaded) {
        clearInterval(interval);
        return;
      }
      hydrateAll();
    }, 10_000);

    return () => clearInterval(interval);
  }, [
    hydrateAccounts,
    hydrateTxs,
    hydrateSettings,
    hydrateCategories,
    hydrateExchangeRate,
    hydrateSubscriptions,
  ]);

  // Movements can arrive while the app is closed (Apple Pay via Shortcuts), and
  // accounts can be created from another device. Pull both whenever the PWA
  // comes back to the foreground, so a new card shows up on Home right away.
  useEffect(() => {
    let lastPull = Date.now();
    async function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastPull < 15_000) return;
      lastPull = Date.now();
      const [, count] = await Promise.all([
        useAccountsStore.getState().pullNew(),
        useTransactionsStore.getState().pullNew(),
      ]);
      if (count > 0) {
        toast.success(count === 1 ? "1 movimiento nuevo" : `${count} movimientos nuevos`);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
