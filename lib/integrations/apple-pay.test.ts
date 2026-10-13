import { describe, expect, it } from "vitest"
import { cardKey, guessCategory, parseAmount, resolveAccount } from "./apple-pay"
import type { Account } from "@/lib/types"

describe("parseAmount", () => {
  it.each([
    ["$45.900,00", 45900],
    ["COP 45.900", 45900],
    ["$ 1.250.000", 1250000],
    ["1,250,000", 1250000],
    ["$12,50", 12.5],
    ["US$12.50", 12.5],
    ["$1,234.56", 1234.56],
    ["8900", 8900],
    [15000, 15000],
  ])("%s → %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(["", "abc", "$0", -5, null, undefined])("rejects %s", (input) => {
    expect(parseAmount(input)).toBeNull()
  })
})

describe("guessCategory", () => {
  it("matches by merchant keyword", () => {
    expect(guessCategory("UBER *TRIP")).toBe("Transporte")
    expect(guessCategory("Juan Valdez Café")).toBe("Comida")
    expect(guessCategory("Droguería Cruz Verde")).toBe("Salud")
  })

  it("matches short keywords only as whole words", () => {
    expect(guessCategory("Tiendas ARA")).toBe("Comida")
    expect(guessCategory("Farandula Store")).toBe("Otro")
  })

  it("falls back to Otro and respects the available list", () => {
    expect(guessCategory("Tienda Random")).toBe("Otro")
    expect(guessCategory(undefined)).toBe("Otro")
    expect(guessCategory("Uber", ["Comida", "Otro"])).toBe("Otro")
  })
})

const base = { institution: "", currency: "COP", initialBalance: 0, createdAt: "" } as const
const nu = { ...base, id: "nu", type: "credit", name: "Nu", institution: "Nu Colombia", last4: "1234", creditLimit: 1, expDate: "", network: "mastercard" } as Account
const bancolombia = { ...base, id: "bc", type: "debit", name: "Ahorros", institution: "Bancolombia", last4: "9876" } as Account
const cdt = { ...base, id: "cdt", type: "fixed_income", name: "CDT Nu", annualRate: 10, startDate: "" } as Account
const accounts = [nu, bancolombia, cdt]

describe("resolveAccount", () => {
  it("uses the explicit mapping first", () => {
    expect(resolveAccount("Mi tarjeta", accounts, { cardMap: { [cardKey("Mi tarjeta")]: "bc" } })?.id).toBe("bc")
  })

  it("matches by last 4, name and institution", () => {
    expect(resolveAccount("Mastercard •••• 1234", accounts, { cardMap: {} })?.id).toBe("nu")
    expect(resolveAccount("NU", accounts, { cardMap: {} })?.id).toBe("nu")
    expect(resolveAccount("Bancolombia Débito", accounts, { cardMap: {} })?.id).toBe("bc")
  })

  it("never picks non-card accounts and falls back to the default", () => {
    expect(resolveAccount("Visa 0000", accounts, { cardMap: {}, defaultAccountId: "bc" })?.id).toBe("bc")
    expect(resolveAccount("Visa 0000", accounts, { cardMap: {}, defaultAccountId: "cdt" })).toBeNull()
    expect(resolveAccount(undefined, accounts, { cardMap: {} })).toBeNull()
  })

  it("makes card names safe as Mongo keys", () => {
    expect(cardKey("Visa Gold. $Plus")).toBe("visa gold_ _plus")
  })
})
