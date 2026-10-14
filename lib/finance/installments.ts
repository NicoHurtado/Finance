import type { Installments, Transaction } from "@/lib/types"

export const MAX_INSTALLMENTS = 72

/** Las compras diferidas guardan cuotas >= 2. Una cuota = sin plan. */
export function isDeferred(
  installments: Installments | undefined
): installments is Installments {
  return !!installments && installments.count >= 2
}

/** Tasa mensual en fracción (0.019 = 1,9% M.V.). E.A. se convierte a su
 *  equivalente mes vencido: (1 + EA)^(1/12) - 1. */
export function monthlyRate(installments: Installments): number {
  const rate = Math.max(0, installments.rate) / 100
  if (installments.rateType === "annual") return Math.pow(1 + rate, 1 / 12) - 1
  return rate
}

/** Cuota fija (sistema francés): capital + intereses iguales cada mes. */
export function installmentPayment(
  amount: number,
  installments: Installments
): number {
  const n = Math.max(1, Math.round(installments.count))
  const r = monthlyRate(installments)
  if (r === 0) return amount / n
  return (amount * r) / (1 - Math.pow(1 + r, -n))
}

export interface InstallmentPlan {
  count: number
  payment: number
  total: number
  interest: number
}

export function installmentPlan(
  amount: number,
  installments: Installments
): InstallmentPlan {
  const count = Math.max(1, Math.round(installments.count))
  const payment = installmentPayment(amount, installments)
  const total = payment * count
  return { count, payment, total, interest: Math.max(0, total - amount) }
}

/** Capital que sigue pendiente después de pagar `paid` cuotas. */
function remainingCapital(
  amount: number,
  installments: Installments,
  paid: number
): number {
  const n = Math.max(1, Math.round(installments.count))
  if (paid >= n) return 0
  const r = monthlyRate(installments)
  const payment = installmentPayment(amount, installments)
  if (r === 0) return Math.max(0, amount - payment * paid)
  const growth = Math.pow(1 + r, paid)
  return Math.max(0, amount * growth - (payment * (growth - 1)) / r)
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth()
}

export interface InstallmentStatus extends InstallmentPlan {
  /** Cuota que toca pagar este mes (o la próxima, si la compra es de este mes). */
  current: number
  paid: number
  remaining: number
  remainingCapital: number
  /** Intereses que trae la cuota actual. */
  currentInterest: number
  finished: boolean
}

/**
 * Estado de una compra diferida en una fecha. La primera cuota se factura el
 * mes siguiente a la compra; cada mes que pasa se da por pagada una cuota.
 */
export function installmentStatus(
  tx: Pick<Transaction, "amount" | "occurredAt">,
  installments: Installments,
  now: Date = new Date()
): InstallmentStatus {
  const plan = installmentPlan(tx.amount, installments)
  const elapsed = monthIndex(now) - monthIndex(new Date(tx.occurredAt))
  const paid = Math.min(plan.count, Math.max(0, elapsed - 1))
  const finished = elapsed > plan.count
  const capital = remainingCapital(tx.amount, installments, paid)
  return {
    ...plan,
    current: Math.min(plan.count, paid + 1),
    paid,
    remaining: plan.count - paid,
    remainingCapital: finished ? 0 : capital,
    currentInterest: finished ? 0 : capital * monthlyRate(installments),
    finished,
  }
}

export interface DeferredPurchase {
  tx: Transaction
  installments: Installments
  status: InstallmentStatus
}

export interface CreditPaymentSummary {
  /** Compras diferidas que aún tienen cuotas por pagar, más recientes primero. */
  active: DeferredPurchase[]
  /** Suma de las cuotas del mes de las compras diferidas activas. */
  installmentsTotal: number
  /** Deuda que no está diferida: se paga completa (compras a 1 cuota). */
  singlePayment: number
  /** Pago estimado del mes: compras a 1 cuota + cuotas de las diferidas. */
  monthlyPayment: number
  /** Capital que todavía se debe de las compras diferidas. */
  deferredCapital: number
}

/**
 * Resume cómo se reparte la deuda de una tarjeta. La deuda total no cambia;
 * lo que cambia es cuánto toca pagar este mes: la parte diferida solo exige su
 * cuota, el resto de la deuda se paga completo.
 */
export function creditPaymentSummary(
  txs: Transaction[],
  balance: number,
  now: Date = new Date()
): CreditPaymentSummary {
  const nowTime = now.getTime()
  const active: DeferredPurchase[] = []
  for (const tx of txs) {
    if (tx.kind !== "expense" || !isDeferred(tx.installments)) continue
    if (new Date(tx.occurredAt).getTime() > nowTime) continue
    const status = installmentStatus(tx, tx.installments, now)
    if (status.finished) continue
    active.push({ tx, installments: tx.installments, status })
  }
  active.sort((a, b) => b.tx.occurredAt.localeCompare(a.tx.occurredAt))

  const debt = Math.max(0, balance)
  let installmentsTotal = 0
  let deferredCapital = 0
  let interest = 0
  for (const item of active) {
    installmentsTotal += item.status.payment
    deferredCapital += item.status.remainingCapital
    interest += item.status.currentInterest
  }
  const singlePayment = Math.max(0, debt - deferredCapital)
  // Si se abonó por adelantado, nunca se pide más que la deuda + intereses.
  const monthlyPayment = Math.min(
    singlePayment + installmentsTotal,
    debt + interest
  )
  return {
    active,
    installmentsTotal,
    singlePayment,
    monthlyPayment,
    deferredCapital,
  }
}
