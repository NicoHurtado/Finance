"use client"
import { useMemo } from "react"
import Link from "next/link"
import { Plus, Repeat, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAccountsStore } from "@/lib/store/accounts"
import { useTransactionsStore } from "@/lib/store/transactions"
import { useSettingsStore } from "@/lib/store/settings"
import { computeAccountBalances, toBaseCurrency } from "@/lib/finance/net-worth"
import {
  formatAccountBalance,
  formatSignedMoney,
} from "@/lib/finance/format"
import { NetWorth } from "@/components/home/net-worth"
import { MiniCard } from "@/components/accounts/mini-card"
import { useExchangeRateStore } from "@/lib/store/exchange-rate"
import { PageHeader, SectionHeading } from "@/components/nav/page-header"
import type { Account, AccountType } from "@/lib/types"

const GROUPS: { type: AccountType; title: string }[] = [
  { type: "debit", title: "Débito" },
  { type: "credit", title: "Tarjetas de Crédito" },
  { type: "fixed_income", title: "Renta Fija" },
  { type: "investment", title: "Inversiones" },
]

export default function CuentasPage() {
  const accounts = useAccountsStore((s) => s.activeAccounts)
  const txs = useTransactionsStore((s) => s.transactions)
  const currency = useSettingsStore((s) => s.defaultCurrency)
  const usdToCop = useExchangeRateStore((s) => s.usdToCop)
  const balances = useMemo(
    () => computeAccountBalances(accounts, txs),
    [accounts, txs]
  )

  const totalAssets = accounts.reduce((s, a) => {
    if (a.type === "credit") return s
    return s + toBaseCurrency(balances.get(a.id) ?? 0, a.currency, usdToCop)
  }, 0)
  const totalDebt = accounts.reduce((s, a) => {
    if (a.type !== "credit") return s
    return s + toBaseCurrency(balances.get(a.id) ?? 0, a.currency, usdToCop)
  }, 0)

  const gross = totalAssets + Math.abs(totalDebt)
  const assetShare = gross > 0 ? (totalAssets / gross) * 100 : 100

  return (
    <div className="p-4 md:p-8">
      <div className="space-y-6">
        <PageHeader eyebrow="Portafolio" title="Cuentas">
          <Link href="/cuentas/apple-pay">
            <Button variant="outline" size="sm" className="gap-1">
              <Smartphone className="size-4" /> Apple Pay
            </Button>
          </Link>
          <Link href="/cuentas/suscripciones">
            <Button variant="outline" size="sm" className="gap-1">
              <Repeat className="size-4" /> Suscripciones
            </Button>
          </Link>
          <Link href="/cuentas/nueva">
            <Button size="sm" className="gap-1">
              <Plus className="size-4" /> Nueva cuenta
            </Button>
          </Link>
        </PageHeader>

        {/* Patrimonio y su composición: una sola tarjeta. Activos y deuda no
            son cifras sueltas flotando en el vacío: cada una ocupa media
            columna y muestra cuánto pesa en la balanza. */}
        <section className="surface grid gap-6 p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:p-6">
          <div className="flex flex-col justify-center">
            <div className="mb-1 text-[12px] font-medium tracking-[-0.005em] text-muted-foreground">
              Patrimonio neto
            </div>
            <NetWorth size="lg" bare />
          </div>
          <div className="flex flex-col gap-3">
            {[
              {
                label: "Activos",
                value: formatSignedMoney(totalAssets, currency),
                share: assetShare,
                tone: "text-positive",
                bar: "bg-positive",
              },
              {
                label: "Deuda",
                value: formatSignedMoney(-totalDebt, currency),
                share: 100 - assetShare,
                tone: "text-destructive",
                bar: "bg-destructive",
              },
            ].map((r) => (
              <div
                key={r.label}
                className="flex flex-1 flex-col justify-center gap-2 rounded-2xl bg-muted/50 px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-medium tracking-[-0.005em] text-muted-foreground">
                    {r.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {r.share.toFixed(0)}%
                  </span>
                </div>
                <div className={`text-lg font-semibold tabular-nums ${r.tone}`}>
                  {r.value}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={`h-full rounded-full ${r.bar}`}
                    style={{ width: `${r.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-7">
          {GROUPS.map((g) => {
            const list = accounts.filter((a) => a.type === g.type)
            if (list.length === 0) return null
            const subtotal = list.reduce(
              (s, a) =>
                s +
                toBaseCurrency(balances.get(a.id) ?? 0, a.currency, usdToCop),
              0
            )
            const isCredit = g.type === "credit"
            return (
              <section key={g.type} className="space-y-2.5">
                <SectionHeading
                  right={
                    <span
                      className={`text-sm font-semibold tabular-nums ${isCredit ? "text-destructive" : ""}`}
                    >
                      {formatSignedMoney(isCredit ? -subtotal : subtotal, currency)}
                    </span>
                  }
                >
                  {g.title} · {list.length}
                </SectionHeading>
                <div className="surface divide-y overflow-hidden rounded-2xl">
                  {list.map((a: Account) => {
                    const bal = balances.get(a.id) ?? 0
                    const meta =
                      a.type === "fixed_income"
                        ? `${a.institution} · ${a.annualRate}% anual`
                        : a.institution
                    return (
                      <Link
                        key={a.id}
                        href={`/cuentas/${a.id}`}
                        className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/50"
                      >
                        <MiniCard account={a} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {a.name}
                          </div>
                          <div className="truncate text-[12px] tracking-[-0.005em] text-muted-foreground">
                            {meta}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-right ${isCredit ? "text-destructive" : ""}`}
                        >
                          <div className="text-sm font-semibold tabular-nums">
                            {formatAccountBalance(
                              a.type,
                              toBaseCurrency(bal, a.currency, usdToCop),
                              a.currency === "USD" && usdToCop
                                ? "COP"
                                : a.currency
                            )}
                          </div>
                          {a.currency === "USD" && usdToCop && (
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              {formatAccountBalance(a.type, bal, "USD")}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {accounts.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aún no tienes cuentas. Crea la primera con{" "}
            <strong>+ Nueva cuenta</strong>.
          </div>
        )}
      </div>
    </div>
  )
}
