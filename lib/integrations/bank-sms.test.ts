import { describe, expect, it } from "vitest"
import type { Account } from "@/lib/types"
import { guessCategory, parseAmount, parseBankSms, resolveAccountByLast4, smsFingerprint } from "./bank-sms"

const NOW = new Date("2026-11-05T15:00:00Z")

describe("parseAmount", () => {
  it.each([
    ["$9.900,00", 9900],
    ["COP97.066,00", 97066],
    ["$36,000.00", 36000],
    ["$1,000,000", 1000000],
    ["$40000.00", 40000],
    ["$26,000.00", 26000],
    ["$12,50", 12.5],
  ])("%s → %d", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })

  it("rejects text without digits", () => {
    expect(parseAmount("$")).toBeNull()
  })
})

describe("parseBankSms", () => {
  it("reads a debit card purchase", () => {
    const sms = parseBankSms(
      "Bancolombia: Compraste $9.900,00 en PLURAL EXPRESS con tu T.Deb *3287, el 30/10/2026 a las 18:58. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.",
      NOW,
    )
    expect(sms).toMatchObject({
      kind: "expense",
      amount: 9900,
      currency: "COP",
      accountLast4: "3287",
      description: "Plural Express",
      merchant: "PLURAL EXPRESS",
      hasDate: true,
      occurredAt: "2026-10-30T23:58:00.000Z",
    })
  })

  it("reads a credit card purchase in COP format", () => {
    const sms = parseBankSms(
      "Bancolombia: Compraste COP97.066,00 en ESTACION TERPEL INTE con tu T.Cred *8761, el 31/10/2026 a las 10:35. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.",
      NOW,
    )
    expect(sms).toMatchObject({
      kind: "expense",
      amount: 97066,
      accountLast4: "8761",
      description: "Estacion Terpel Inte",
      occurredAt: "2026-10-31T15:35:00.000Z",
    })
    expect(guessCategory(sms?.merchant)).toBe("Transporte")
  })

  it("reads a QR payment with US-style amount", () => {
    const sms = parseBankSms(
      "Bancolombia: NICOLAS HURTADO AMEZQUITA pagaste $36,000.00 por codigo QR desde tu cuenta *0560 a la llave 0093297577 el 31/10/2026 a las 19:09. Con codigo QR es facil y de una. Dudas al 018000912345",
      NOW,
    )
    expect(sms).toMatchObject({
      kind: "transfer",
      amount: 36000,
      accountLast4: "0560",
      description: "Pago QR · llave 0093297577",
      counterpartLast4: undefined,
    })
  })

  it("reads a Bre-B transfer with a two-digit year", () => {
    const sms = parseBankSms(
      "Bancolombia: NICOLAS, transferiste $26,000.00 a la llave @mariana5071 desde tu cuenta *0560 a Mariana Vargas Cano el 02/11/26 a las 07:51. Con Bre-b es de una y gratis. Dudas al 018000912345",
      NOW,
    )
    expect(sms).toMatchObject({
      kind: "transfer",
      amount: 26000,
      accountLast4: "0560",
      description: "Transferencia a Mariana Vargas Cano",
      occurredAt: "2026-11-02T12:51:00.000Z",
    })
  })

  it("reads a transfer without decimals or thousands separators", () => {
    const sms = parseBankSms(
      "Bancolombia: NICOLAS, transferiste $40,000.00 a la llave @jacobog3374 desde tu cuenta *0560 a JACOBO GOMEZ ORTEGA el 05/11/26 a las 10:22.",
      NOW,
    )
    expect(sms).toMatchObject({ amount: 40000, description: "Transferencia a Jacobo Gomez Ortega" })
  })

  it("keeps the destination account of a transfer to an account number", () => {
    const sms = parseBankSms(
      "Bancolombia: Transferiste $1,000,000 desde tu cuenta *0560 a la cuenta *10332495421 el 29/10/2026 a las 16:18. ¿Dudas? Llamanos al 018000931987. Estamos cerca.",
      NOW,
    )
    expect(sms).toMatchObject({
      kind: "transfer",
      amount: 1000000,
      accountLast4: "0560",
      counterpartLast4: "5421",
      description: "Transferencia a cuenta *5421",
    })
  })

  it("reads a withdrawal from a Fiducuenta into another account", () => {
    const sms = parseBankSms(
      "Bancolombia: Retiraste $600,000.00 de tu cuenta *1456 Fiducuenta el 2026/11/06 07:31:05, hacia la cuenta *10332495421. ¿Dudas? 6045109009",
      NOW,
    )
    expect(sms).toMatchObject({
      kind: "transfer",
      amount: 600000,
      accountLast4: "1456",
      counterpartLast4: "5421",
      description: "Retiro de Fiducuenta",
      hasDate: true,
      occurredAt: "2026-11-06T12:31:00.000Z",
    })
  })

  it("reads an Amazon purchase", () => {
    const sms = parseBankSms(
      "Bancolombia: Compraste COP65.955,00 en AMAZON COM con tu T.Cred *8761, el 05/11/2026 a las 23:02. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.",
      NOW,
    )
    expect(sms).toMatchObject({ kind: "expense", amount: 65955, accountLast4: "8761", occurredAt: "2026-11-06T04:02:00.000Z" })
    expect(guessCategory(sms?.merchant)).toBe("Shopping")
  })

  it("reads incoming money", () => {
    const sms = parseBankSms(
      "Bancolombia: Recibiste una transferencia por $150,000.00 de JUAN PEREZ en tu cuenta *0560, el 03/11/2026 a las 09:00.",
      NOW,
    )
    expect(sms).toMatchObject({ kind: "income", amount: 150000, accountLast4: "0560", description: "Recibido de Juan Perez" })
  })

  it("falls back to now when the SMS has no date", () => {
    const sms = parseBankSms("Bancolombia: Compraste $5.000 en TIENDA con tu T.Deb *3287.", NOW)
    expect(sms).toMatchObject({ hasDate: false, occurredAt: NOW.toISOString() })
  })

  it("ignores messages that are not movements", () => {
    expect(parseBankSms("Bancolombia: Tu clave dinamica es 123456. No la compartas.", NOW)).toBeNull()
    expect(parseBankSms("Bancolombia: Aprovecha la tasa preferencial en tu tarjeta.", NOW)).toBeNull()
  })

  it("fingerprints the same SMS identically despite spacing", () => {
    expect(smsFingerprint("Compraste  $1 en X\n")).toBe(smsFingerprint("compraste $1 en x"))
  })
})

describe("resolveAccountByLast4", () => {
  const base = { institution: "Bancolombia", currency: "COP", initialBalance: 0, createdAt: "2026-01-01T00:00:00Z" } as const
  const credit = { ...base, id: "tc", type: "credit", name: "TC", last4: "8761", creditLimit: 1, expDate: "", network: "visa" } as Account
  const savings = { ...base, id: "ah", type: "debit", name: "Ahorros" } as Account

  it("matches by last 4 digits", () => {
    expect(resolveAccountByLast4("8761", [credit, savings], {})?.id).toBe("tc")
  })

  it("maps savings products (fixed income) explicitly", () => {
    const fidu = { ...base, id: "fidu", type: "fixed_income", name: "Fiducuenta", annualRate: 8, startDate: "2026-01-01" } as Account
    expect(resolveAccountByLast4("1456", [credit, savings, fidu], { "1456": "fidu" })?.id).toBe("fidu")
  })

  it("uses the explicit mapping when the account has no last 4", () => {
    expect(resolveAccountByLast4("0560", [credit, savings], { "0560": "ah" })?.id).toBe("ah")
  })

  it("returns null when nothing matches", () => {
    expect(resolveAccountByLast4("0560", [credit, savings], {})).toBeNull()
  })
})
