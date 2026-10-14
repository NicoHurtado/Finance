"use client";
import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatMoney } from "@/lib/finance/format";
import type { CreditPaymentSummary } from "@/lib/finance/installments";
import type { Currency, Transaction } from "@/lib/types";
import { TransactionEditDialog } from "@/components/transactions/transaction-edit-dialog";

function rateLabel(rate: number, rateType: "monthly" | "annual") {
  if (rate <= 0) return "Sin interés";
  return `${rate.toLocaleString("es-CO", { maximumFractionDigits: 2 })}% ${rateType === "monthly" ? "M.V." : "E.A."}`;
}

/** Detalle de las compras diferidas de una tarjeta de crédito. */
export function InstallmentPurchases({
  summary,
  currency,
}: {
  summary: CreditPaymentSummary;
  currency: Currency;
}) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  if (summary.active.length === 0) return null;

  return (
    <section className="space-y-3 md:rounded-2xl md:border md:bg-card md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Compras a cuotas</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatMoney(summary.installmentsTotal, currency)}/mes
        </span>
      </div>

      <ul className="divide-y">
        {summary.active.map(({ tx, installments, status }) => (
          <li key={tx.id}>
            <button
              type="button"
              onClick={() => setEditing(tx)}
              className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{tx.description || tx.category}</div>
                <div className="truncate text-[11px] text-muted-foreground tabular-nums">
                  {formatMoney(tx.amount, currency)} · {format(new Date(tx.occurredAt), "d MMM yyyy", { locale: es })} ·{" "}
                  {rateLabel(installments.rate, installments.rateType)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${(status.paid / status.count) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    Cuota {status.current} de {status.count}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums">{formatMoney(status.payment, currency)}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  debes {formatMoney(status.remainingCapital, currency)}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <TransactionEditDialog tx={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </section>
  );
}
