import type { Account, Transaction } from "@/lib/types"
import { accountBalance } from "./credit"
import { fixedIncomeBalance } from "./fixed-income"
import { creditPaymentSummary } from "./installments"

export function computeAccountBalance(
  account: Account,
  txs: Transaction[],
  now: Date = new Date()
): number {
  if (account.type === "fixed_income")
    return fixedIncomeBalance(account, txs, now)
  return accountBalance(account, txs, now)
}

export function groupTransactionsByAccount(
  txs: Transaction[]
): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const current = grouped.get(tx.accountId)
    if (current) current.push(tx)
    else grouped.set(tx.accountId, [tx])
  }
  return grouped
}

/** Calculate every balance with a single pass to partition transactions. */
export function computeAccountBalances(
  accounts: Account[],
  txs: Transaction[],
  now: Date = new Date()
): Map<string, number> {
  const grouped = groupTransactionsByAccount(txs)
  return new Map(
    accounts.map((account) => [
      account.id,
      computeAccountBalance(account, grouped.get(account.id) ?? [], now),
    ])
  )
}

/** Convert a balance to COP. USD accounts use TRM if available, otherwise kept as-is. */
export function toBaseCurrency(
  balance: number,
  currency: string,
  usdToCop?: number | null
): number {
  if (currency === "USD" && usdToCop) return balance * usdToCop
  return balance
}

export function netWorth(
  accounts: Account[],
  txs: Transaction[],
  now: Date = new Date(),
  usdToCop?: number | null
): number {
  return portfolioTotals(accounts, txs, now, usdToCop).netWorth
}

export interface PortfolioTotals {
  netWorth: number
  /** Activos líquidos menos el próximo pago de las tarjetas (no la deuda total). */
  liquidNetWorth: number
  investments: { cop: number; usd: number }
  /** Deuda general: todo lo que se debe en tarjetas, incluidas las cuotas futuras. */
  debt: number
  /** Lo que sí o sí toca pagar en el próximo corte: compras a 1 cuota + la
   *  cuota del mes (con intereses) de las compras diferidas. */
  nextPayment: number
}

/** All headline totals from one grouped balance calculation. */
export function portfolioTotals(
  accounts: Account[],
  txs: Transaction[],
  now: Date = new Date(),
  usdToCop?: number | null
): PortfolioTotals {
  const grouped = groupTransactionsByAccount(txs)
  let net = 0
  let liquid = 0
  let investmentCop = 0
  let investmentUsd = 0
  let debt = 0
  let nextPayment = 0

  for (const account of accounts) {
    const accountTxs = grouped.get(account.id) ?? []
    const balance = computeAccountBalance(account, accountTxs, now)
    const balanceCop = toBaseCurrency(balance, account.currency, usdToCop)
    if (account.type === "credit") {
      net -= balanceCop
      if (balance <= 0) {
        // Saldo a favor en la tarjeta: es plata disponible.
        liquid -= balanceCop
        continue
      }
      debt += balanceCop
      // La liquidez solo descuenta el pago del mes, no las cuotas futuras.
      const payment = toBaseCurrency(
        creditPaymentSummary(accountTxs, balance, now).monthlyPayment,
        account.currency,
        usdToCop
      )
      nextPayment += payment
      liquid -= payment
    } else {
      net += balanceCop
      if (account.type === "investment") {
        investmentCop += balanceCop
        if (account.currency === "USD") investmentUsd += balance
      } else {
        liquid += balanceCop
      }
    }
  }

  return {
    netWorth: net,
    liquidNetWorth: liquid,
    investments: { cop: investmentCop, usd: investmentUsd },
    debt,
    nextPayment,
  }
}

/** Patrimonio sin las inversiones de bolsa (plata que sí se puede tocar),
 *  descontando solo el próximo pago de las tarjetas. */
export function liquidNetWorth(
  accounts: Account[],
  txs: Transaction[],
  now: Date = new Date(),
  usdToCop?: number | null
): number {
  return portfolioTotals(accounts, txs, now, usdToCop).liquidNetWorth
}

/** Total en cuentas de inversión: en COP (vía TRM) y el subtotal en USD. */
export function investmentsTotal(
  accounts: Account[],
  txs: Transaction[],
  now: Date = new Date(),
  usdToCop?: number | null
): { cop: number; usd: number } {
  return portfolioTotals(accounts, txs, now, usdToCop).investments
}

/** % cambio vs hace 30 días aprox. */
export function monthlyChangePct(
  accounts: Account[],
  txs: Transaction[],
  now: Date = new Date(),
  usdToCop?: number | null
): number {
  const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const txsPast = txs.filter((t) => new Date(t.occurredAt) <= past)
  const current = portfolioTotals(accounts, txs, now, usdToCop).netWorth
  const previous = portfolioTotals(accounts, txsPast, past, usdToCop).netWorth
  if (previous === 0) return 0
  return ((current - previous) / Math.abs(previous)) * 100
}
