"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/finance/format";
import { installmentPlan, MAX_INSTALLMENTS } from "@/lib/finance/installments";
import type { Currency, Installments, InstallmentRateType } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [1, 2, 3, 6, 12, 24, 36];

/**
 * Cuotas de una compra con tarjeta de crédito. Por defecto es una cuota y se
 * queda en una línea discreta; solo se despliega si el usuario la toca.
 * `value` undefined = una cuota.
 */
export function InstallmentsPicker({
  amount,
  currency,
  value,
  onChange,
}: {
  amount: number;
  currency: Currency;
  value: Installments | undefined;
  onChange: (value: Installments | undefined) => void;
}) {
  const [open, setOpen] = useState(!!value);
  const count = value?.count ?? 1;
  const [rate, setRate] = useState(value ? String(value.rate) : "");
  const [rateType, setRateType] = useState<InstallmentRateType>(
    value?.rateType ?? "monthly",
  );
  const [custom, setCustom] = useState(
    value && !PRESETS.includes(value.count) ? String(value.count) : "",
  );

  const emit = (nextCount: number, nextRate = rate, nextType = rateType) => {
    if (nextCount < 2) return onChange(undefined);
    const parsed = parseFloat(nextRate.replace(",", "."));
    onChange({
      count: Math.min(MAX_INSTALLMENTS, Math.round(nextCount)),
      rate: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      rateType: nextType,
    });
  };

  const plan = value && amount > 0 ? installmentPlan(amount, value) : null;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>
          {count === 1 ? (
            "A 1 cuota"
          ) : (
            <>
              A {count} cuotas
              {plan && (
                <span className="tabular-nums"> · {formatMoney(plan.payment, currency)}/mes</span>
              )}
            </>
          )}
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-2.5 rounded-xl border bg-muted/30 p-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setCustom("");
                  emit(n);
                }}
                className={cn(
                  "h-7 min-w-7 rounded-md px-2 tabular-nums transition-colors",
                  count === n && !custom
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={2}
              max={MAX_INSTALLMENTS}
              placeholder="Otra"
              aria-label="Número de cuotas"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) emit(n);
              }}
              className={cn(
                "h-7 w-14 rounded-md border bg-background px-2 text-center tabular-nums outline-none focus:border-ring",
                custom && "border-foreground",
              )}
            />
          </div>

          {count > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Interés</span>
              <div className="flex h-7 items-center rounded-md border bg-background pr-2 focus-within:border-ring">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Tasa de interés"
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    emit(count, e.target.value);
                  }}
                  className="h-full w-12 bg-transparent px-2 text-right tabular-nums outline-none"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <div className="flex h-7 rounded-md bg-muted p-0.5">
                {(["monthly", "annual"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setRateType(t);
                      emit(count, rate, t);
                    }}
                    className={cn(
                      "rounded px-2 text-[11px] font-medium transition-colors",
                      rateType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {t === "monthly" ? "M.V." : "E.A."}
                  </button>
                ))}
              </div>
            </div>
          )}

          {plan && (
            <p className="text-muted-foreground tabular-nums">
              {plan.count} × <span className="font-medium text-foreground">{formatMoney(plan.payment, currency)}</span>
              {plan.interest > 0.005 ? (
                <> · intereses {formatMoney(plan.interest, currency)} · total {formatMoney(plan.total, currency)}</>
              ) : (
                " · sin interés"
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
