import { describe, expect, it } from "vitest"
import type { Transaction } from "@/lib/types"
import { creditPaymentSummary, installmentPlan, installmentStatus, monthlyRate } from "./installments"
import { portfolioTotals } from "./net-worth"
import { parseTransaction } from "./transaction-validation"
import type { Account } from "@/lib/types"

const purchase = (amount: number, occurredAt: string, count: number, rate = 0): Transaction => ({
  id: `tx-${amount}`,
  accountId: "card",
  kind: "expense",
  amount,
  category: "Compras",
  occurredAt,
  installments: { count, rate, rateType: "monthly" },
})

describe("installments", () => {
  it("splits an interest-free purchase evenly", () => {
    const plan = installmentPlan(1_200_000, { count: 12, rate: 0, rateType: "monthly" })
    expect(plan.payment).toBe(100_000)
    expect(plan.interest).toBe(0)
  })

  it("uses a fixed payment with interest", () => {
    const plan = installmentPlan(1_000_000, { count: 12, rate: 2, rateType: "monthly" })
    expect(plan.payment).toBeCloseTo(94_559.6, 0)
    expect(plan.total).toBeCloseTo(plan.payment * 12, 6)
  })

  it("converts an effective annual rate to monthly", () => {
    expect(monthlyRate({ count: 2, rate: 26.82, rateType: "annual" })).toBeCloseTo(0.02, 4)
  })

  it("tracks the current installment by calendar month", () => {
    const tx = purchase(600, "2026-01-15T12:00:00Z", 6)
    expect(installmentStatus(tx, tx.installments!, new Date("2026-01-20T12:00:00Z")).current).toBe(1)
    const april = installmentStatus(tx, tx.installments!, new Date("2026-04-10T12:00:00Z"))
    expect(april.current).toBe(3)
    expect(april.remainingCapital).toBe(400)
    expect(installmentStatus(tx, tx.installments!, new Date("2026-08-01T12:00:00Z")).finished).toBe(true)
  })

  it("keeps the full debt but asks only for the installment of deferred purchases", () => {
    const deferred = purchase(1_200_000, "2026-03-05T12:00:00Z", 12)
    const single: Transaction = { ...purchase(300_000, "2026-03-06T12:00:00Z", 1), installments: undefined }
    const summary = creditPaymentSummary([deferred, single], 1_500_000, new Date("2026-03-20T12:00:00Z"))
    expect(summary.installmentsTotal).toBe(100_000)
    expect(summary.singlePayment).toBe(300_000)
    expect(summary.monthlyPayment).toBe(400_000)
  })

  it("subtracts only the next payment from liquidity, not the whole debt", () => {
    const accounts = [
      { id: "bank", type: "debit", institution: "B", name: "B", currency: "COP", initialBalance: 2_000_000, createdAt: "2026-01-01T00:00:00Z" },
      { id: "card", type: "credit", institution: "C", name: "C", currency: "COP", initialBalance: 0, createdAt: "2026-01-01T00:00:00Z", creditLimit: 5_000_000, last4: "1234", expDate: "01/30", network: "visa" },
    ] as Account[]
    const deferred = purchase(1_000_000, "2026-03-05T12:00:00Z", 12, 2)
    const single: Transaction = { ...purchase(300_000, "2026-03-06T12:00:00Z", 1), installments: undefined }
    const totals = portfolioTotals(accounts, [deferred, single], new Date("2026-03-20T12:00:00Z"))
    expect(totals.debt).toBe(1_300_000)
    expect(totals.netWorth).toBe(700_000)
    expect(totals.nextPayment).toBeCloseTo(300_000 + 94_559.6, 0)
    expect(totals.liquidNetWorth).toBeCloseTo(2_000_000 - totals.nextPayment, 6)
  })

  it("only allows installments on expenses", () => {
    expect(() => parseTransaction({ ...purchase(100, "2026-01-01T00:00:00Z", 3), kind: "income" })).toThrow()
    expect(parseTransaction({ ...purchase(100, "2026-01-01T00:00:00Z", 3), installments: null }).installments).toBeUndefined()
  })
})
