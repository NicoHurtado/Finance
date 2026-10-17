"use client"
import { useMemo } from "react"
import {
  Wallet,
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  LineChart,
  Landmark,
} from "lucide-react"
import { startOfMonth } from "date-fns"
import { useAccountsStore } from "@/lib/store/accounts"
import { useTransactionsStore } from "@/lib/store/transactions"
import { useSettingsStore } from "@/lib/store/settings"
import { useExchangeRateStore } from "@/lib/store/exchange-rate"
import { portfolioTotals } from "@/lib/finance/net-worth"
import { formatMoney, formatPct } from "@/lib/finance/format"
import { KpiCard } from "./kpi-card"

export function HomeKpis() {
  const accounts = useAccountsStore((s) => s.activeAccounts)
  const txs = useTransactionsStore((s) => s.transactions)
  const currency = useSettingsStore((s) => s.defaultCurrency)
  const usdToCop = useExchangeRateStore((s) => s.usdToCop)

  const { nw, liquid, inv, debt, nextPayment, pct, expensesMonth, incomeMonth } =
    useMemo(() => {
      const now = new Date()
      const monthStart = startOfMonth(now)
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      let expense = 0
      let income = 0
      const pastTransactions = [] as typeof txs
      for (const t of txs) {
        const occurredAt = new Date(t.occurredAt)
        if (occurredAt <= past) pastTransactions.push(t)
        if (occurredAt < monthStart) continue
        if (t.kind === "expense") expense += t.amount
        else if (t.kind === "income") income += t.amount
      }
      const current = portfolioTotals(accounts, txs, now, usdToCop)
      const previous = portfolioTotals(
        accounts,
        pastTransactions,
        past,
        usdToCop
      ).netWorth
      return {
        nw: current.netWorth,
        liquid: current.liquidNetWorth,
        inv: current.investments,
        debt: current.debt,
        nextPayment: current.nextPayment,
        pct:
          previous === 0
            ? 0
            : ((current.netWorth - previous) / Math.abs(previous)) * 100,
        expensesMonth: expense,
        incomeMonth: income,
      }
    }, [accounts, txs, usdToCop])

  return (
    <div className="coffee-kpis grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Patrimonio líquido"
        value={`${liquid < 0 ? "-" : ""}${formatMoney(liquid, currency)}`}
        delta={
          nextPayment > 0
            ? `Descuenta ${formatMoney(nextPayment, currency)} de tarjetas`
            : "Sin inversiones de bolsa"
        }
        icon={Landmark}
        valueTone={liquid < 0 ? "down" : "neutral"}
      />
      <KpiCard
        label="Inversiones bolsa"
        value={formatMoney(inv.cop, currency)}
        delta={
          inv.usd > 0
            ? `$${inv.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
            : undefined
        }
        icon={LineChart}
      />
      <KpiCard
        label="Patrimonio total"
        value={`${nw < 0 ? "-" : ""}${formatMoney(nw, currency)}`}
        delta={`${formatPct(pct)} este mes`}
        icon={Wallet}
        tone={pct >= 0 ? "up" : "down"}
        valueTone={nw < 0 ? "down" : "neutral"}
      />
      <KpiCard
        label="Ingresos del mes"
        value={`+${formatMoney(incomeMonth, currency)}`}
        icon={ArrowUpRight}
        valueTone="up"
      />
      <KpiCard
        label="Gastos del mes"
        value={`-${formatMoney(expensesMonth, currency)}`}
        icon={ArrowDownRight}
        valueTone="down"
      />
      <KpiCard
        label="Deuda general"
        value={`${debt > 0 ? "-" : ""}${formatMoney(debt, currency)}`}
        delta={`Pago del mes ${formatMoney(nextPayment, currency)}`}
        icon={CreditCard}
        valueTone={debt > 0 ? "down" : "neutral"}
      />
    </div>
  )
}
