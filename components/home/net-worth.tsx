"use client";
import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAccountsStore } from "@/lib/store/accounts";
import { useTransactionsStore } from "@/lib/store/transactions";
import { useSettingsStore } from "@/lib/store/settings";
import { useExchangeRateStore } from "@/lib/store/exchange-rate";
import { monthlyChangePct, portfolioTotals } from "@/lib/finance/net-worth";
import { formatMoney, formatPct } from "@/lib/finance/format";

export function NetWorth({
  size = "xl",
  bare = false,
}: {
  size?: "xl" | "lg";
  /** Sin su propio panel: para cuando ya vive dentro de otra tarjeta. */
  bare?: boolean;
}) {
  const accounts = useAccountsStore((s) => s.activeAccounts);
  const txs = useTransactionsStore((s) => s.transactions);
  const currency = useSettingsStore((s) => s.defaultCurrency);
  const usdToCop = useExchangeRateStore((s) => s.usdToCop);
  const { total, pct, liquid, inv, debt, nextPayment } = useMemo(() => {
    const now = new Date();
    const totals = portfolioTotals(accounts, txs, now, usdToCop);
    return {
      total: totals.netWorth,
      pct: monthlyChangePct(accounts, txs, now, usdToCop),
      liquid: totals.liquidNetWorth,
      inv: totals.investments,
      debt: totals.debt,
      nextPayment: totals.nextPayment,
    };
  }, [accounts, txs, usdToCop]);
  const up = pct >= 0;
  const negative = total < 0;
  return (
    <div className={bare ? undefined : "coffee-net-worth"}>
      <div
        className={`${size === "xl" ? "text-4xl" : "text-3xl"} font-bold tabular-nums ${negative ? "text-destructive" : ""}`}
      >
        {negative ? "-" : ""}
        {formatMoney(total, currency)}
      </div>
      <div
        className={`mt-1 text-sm flex items-center gap-1 ${up ? "text-positive" : "text-destructive"}`}
      >
        {up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
        {formatPct(pct)} este mes
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[12px] tracking-[-0.005em] text-muted-foreground">
            Patrimonio líquido
          </div>
          <div className="text-sm font-semibold tabular-nums mt-0.5">
            {liquid < 0 ? "-" : ""}
            {formatMoney(liquid, currency)}
          </div>
          {nextPayment > 0 && (
            <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
              Ya resta {formatMoney(nextPayment, currency)} del pago de tarjetas
            </div>
          )}
        </div>
        <div>
          <div className="text-[12px] tracking-[-0.005em] text-muted-foreground">
            Inversiones bolsa
          </div>
          <div className="text-sm font-semibold tabular-nums mt-0.5">
            {formatMoney(inv.cop, currency)}
            {inv.usd > 0 && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ${inv.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
            )}
          </div>
        </div>
        {debt > 0 && (
          <div>
            <div className="text-[12px] tracking-[-0.005em] text-muted-foreground">
              Deuda general
            </div>
            <div className="text-sm font-semibold tabular-nums mt-0.5 text-destructive">
              -{formatMoney(debt, currency)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
