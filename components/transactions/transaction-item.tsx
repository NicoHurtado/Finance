"use client";
import { createElement } from "react";
import { format } from "date-fns";
import { getCategoryIcon } from "@/lib/finance/categories";
import { signedAmount } from "@/lib/finance/format";
import { installmentStatus, isDeferred } from "@/lib/finance/installments";
import type { Transaction, Currency, AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TransactionItem({
  tx,
  currency = "USD",
  showTime = false,
  onClick,
  accountType,
}: {
  tx: Transaction;
  currency?: Currency;
  showTime?: boolean;
  onClick?: () => void;
  /** Tipo de la cuenta cuya actividad se está mostrando (vistas por cuenta). */
  accountType?: AccountType;
}) {
  const icon = createElement(getCategoryIcon(tx.category), {
    className: "size-4.5 text-muted-foreground",
  });
  const isExpense = tx.kind === "expense";
  const isIncome = tx.kind === "income";
  const isTransfer = tx.kind === "transfer";
  // En una tarjeta de crédito, el traslado "out" es un pago que reduce la
  // deuda: se muestra en verde (como un ingreso) en vez de azul.
  const isCardPayment =
    isTransfer && accountType === "credit" && tx.direction !== "in";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-3 px-2.5 hover:bg-muted rounded-2xl text-left transition-colors"
    >
      <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {tx.description || tx.category}
        </div>
        <div className="text-[10.5px] tracking-[-0.005em] text-muted-foreground truncate tabular-nums">
          {tx.category}
          {isExpense && isDeferred(tx.installments)
            ? (() => {
                const st = installmentStatus(tx, tx.installments);
                return st.finished ? ` · ${st.count} cuotas` : ` · Cuota ${st.current}/${st.count}`;
              })()
            : ""}
          {showTime ? ` · ${format(new Date(tx.occurredAt), "HH:mm")}` : ""}
        </div>
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          isExpense && "text-destructive",
          isIncome && "text-positive",
          isTransfer && (isCardPayment ? "text-positive" : "text-foreground"),
        )}
      >
        {signedAmount(tx.kind, tx.amount, currency)}
      </div>
    </button>
  );
}
