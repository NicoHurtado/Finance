import type { Account } from "@/lib/types"

/**
 * Pure helpers for the bank SMS integration: an iOS Shortcuts "Message"
 * automation forwards every Bancolombia SMS (short code 85540) to the app,
 * which turns it into a movement. Kept free of server-only imports so it can
 * be unit tested.
 */

export type SmsKind = "expense" | "income" | "transfer"

export interface ParsedSms {
  /**
   * "transfer" means money left one of the user's products towards someone
   * else; the server turns it into an internal transfer when the destination
   * is one of the user's own accounts, otherwise into an expense.
   */
  kind: SmsKind
  amount: number
  currency: "COP" | "USD"
  /** Last 4 digits of the user's product the money moved from (or into, for income). */
  accountLast4: string | null
  /** Last 4 digits of a destination account/card, when the SMS names one. */
  counterpartLast4?: string
  description: string
  /** Text used to guess the category (merchant, recipient…). */
  merchant?: string
  /** ISO timestamp. Falls back to "now" when the SMS has no date. */
  occurredAt: string
  /** True when the date/time was read from the SMS itself. */
  hasDate: boolean
}

/**
 * Parses an amount as Bancolombia writes it, which mixes formats:
 * "$9.900,00", "COP97.066,00", "$36,000.00", "$1,000,000", "$40000.00".
 * Returns null when no positive amount can be read.
 */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, "")
  if (!/\d/.test(cleaned)) return null

  const lastDot = cleaned.lastIndexOf(".")
  const lastComma = cleaned.lastIndexOf(",")
  let normalized: string

  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators: whichever comes last is the decimal one.
    const decimal = lastDot > lastComma ? "." : ","
    const thousands = decimal === "." ? "," : "."
    normalized = cleaned.split(thousands).join("").replace(decimal, ".")
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? "." : ","
    const parts = cleaned.split(sep)
    const tail = parts[parts.length - 1]
    // "45.900" / "1,250,000" → thousands. "12,50" / "40000.00" → decimals.
    const isThousands = parts.length > 2 || tail.length === 3
    normalized = isThousands ? parts.join("") : `${parts.slice(0, -1).join("")}.${tail}`
  } else {
    normalized = cleaned
  }

  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null
}

export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Stable text used for de-duplication: the same SMS forwarded twice. */
export function smsFingerprint(text: string): string {
  return normalizeKey(text).replace(/[^a-z0-9*$.,:/@ ]/g, "")
}

/** Colombia has no DST: local time is always UTC−5. */
const COLOMBIA_OFFSET_HOURS = 5

function parseDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*,?\s*a\s+las\s+(\d{1,2}):(\d{2}))?/i)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = Number(m[3])
  if (year < 100) year += 2000
  const hour = m[4] ? Number(m[4]) : 12
  const minute = m[5] ? Number(m[5]) : 0
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const date = new Date(Date.UTC(year, month - 1, day, hour + COLOMBIA_OFFSET_HOURS, minute))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const MONEY = String.raw`(?:COP|USD|US\$|\$)\s?[\d][\d.,]*`

function clean(value: string | undefined): string | undefined {
  const v = value?.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim()
  return v ? v : undefined
}

function title(value: string): string {
  // "PLURAL EXPRESS" → "Plural Express"; keeps llaves like "@mariana5071".
  if (value.startsWith("@") || /\d{5,}/.test(value)) return value
  return value.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

function last4(digits: string): string {
  return digits.slice(-4)
}

/**
 * Reads a Bancolombia SMS. Returns null when it is not a movement the app
 * understands (OTP codes, marketing, unknown formats…).
 */
export function parseBankSms(raw: string, now: Date = new Date()): ParsedSms | null {
  const text = raw.replace(/\s+/g, " ").replace(/^\s*Bancolombia\s*:\s*/i, "").trim()
  const lower = normalizeKey(text)

  const moneyMatch = text.match(new RegExp(MONEY, "i"))
  if (!moneyMatch) return null
  const amount = parseAmount(moneyMatch[0])
  if (amount === null) return null
  const currency = /^(USD|US\$)/i.test(moneyMatch[0]) ? "USD" : "COP"

  const parsedDate = parseDate(text)
  const occurredAt = parsedDate ?? now.toISOString()

  // Every "*1234" (or longer account number) mentioned in the SMS.
  const refs = [...text.matchAll(/\*\s?(\d{4,})/g)].map((m) => last4(m[1]))
  // The user's own product: "con tu T.Cred *8761", "desde tu cuenta *0560", "en tu cuenta *0560"…
  const ownMatch =
    text.match(/\btu\s+(?:T\.?\s?(?:Cred|Deb)\w*\.?|tarjeta(?:\s+\w+)?|cuenta(?:\s+\w+)?|producto)\s*\*\s?(\d{4,})/i) ??
    text.match(/\*\s?(\d{4,})/)
  const accountLast4 = ownMatch ? last4(ownMatch[1]) : null
  // Any other "*1234" is where the money went ("a la cuenta *10332495421").
  const counterpartLast4 = refs.find((r) => r !== accountLast4)

  const base = { amount, currency, accountLast4, occurredAt, hasDate: parsedDate !== null } as const

  // Compraste $X en MERCHANT con tu T.Cred *1234
  if (/\bcompraste\b/.test(lower)) {
    const merchant = clean(text.match(new RegExp(`compraste\\s+${MONEY}\\s+en\\s+(.+?)\\s+con\\s+tu\\b`, "i"))?.[1])
    return { ...base, kind: "expense", description: merchant ? title(merchant) : "Compra", merchant }
  }

  // Retiraste $X en CAJERO … de tu T.Deb *1234
  if (/\bretiraste\b/.test(lower)) {
    const place = clean(text.match(new RegExp(`retiraste\\s+${MONEY}\\s+en\\s+(.+?)\\s+(?:de|desde|con)\\s+tu\\b`, "i"))?.[1])
    return { ...base, kind: "expense", description: place ? `Retiro · ${title(place)}` : "Retiro en cajero" }
  }

  // Recibiste una transferencia por $X de NOMBRE en tu cuenta *1234
  if (/\brecibiste\b/.test(lower)) {
    const from = clean(text.match(/\bde\s+(.+?)\s+(?:en|a)\s+tu\b/i)?.[1])
    return {
      ...base,
      kind: "income",
      description: from ? `Recibido de ${title(from)}` : "Ingreso",
      merchant: from,
    }
  }

  // [NOMBRE] transferiste $X a la llave @x desde tu cuenta *0560 a NOMBRE el …
  // Transferiste $X desde tu cuenta *0560 a la cuenta *10332495421 el …
  if (/\btransferiste\b/.test(lower)) {
    const key = clean(text.match(/a\s+la\s+llave\s+(\S+)/i)?.[1])
    const recipient = clean(text.match(/\*\s?\d{4,}\s+a\s+(?!la\s+(?:cuenta|llave)\b)(.+?)\s+el\s+\d{1,2}\//i)?.[1])
    const who = recipient ? title(recipient) : key ?? (counterpartLast4 ? `cuenta *${counterpartLast4}` : undefined)
    return {
      ...base,
      kind: "transfer",
      counterpartLast4,
      description: who ? `Transferencia a ${who}` : "Transferencia",
      merchant: recipient ?? key,
    }
  }

  // [NOMBRE] pagaste $X por codigo QR desde tu cuenta *0560 a la llave 0093297577 …
  // Pagaste $X a EMPRESA desde tu cuenta *0560 …
  if (/\bpagaste\b/.test(lower)) {
    if (/codigo qr/.test(lower)) {
      const key = clean(text.match(/a\s+la\s+llave\s+(\S+)/i)?.[1])
      return {
        ...base,
        kind: "transfer",
        counterpartLast4,
        description: key ? `Pago QR · llave ${key}` : "Pago QR",
      }
    }
    const payee = clean(
      text.match(new RegExp(`pagaste\\s+${MONEY}\\s+(?:a|en)\\s+(.+?)\\s+(?:desde|con|de)\\s+tu\\b`, "i"))?.[1],
    )
    return {
      ...base,
      kind: "transfer",
      counterpartLast4,
      description: payee ? `Pago a ${title(payee)}` : "Pago",
      merchant: payee,
    }
  }

  return null
}

const CATEGORY_KEYWORDS: Array<[category: string, keywords: string[]]> = [
  [
    "Comida",
    [
      "rappi", "ifood", "didi food", "restaurante", "restaurant", "cafe", "coffee",
      "juan valdez", "starbucks", "tostao", "crepes", "frisby", "kfc", "mcdonald",
      "burger", "el corral", "subway", "domino", "pizza", "panaderia", "exito",
      "carulla", "jumbo", "olimpica", "ara", "d1", "oxxo", "isimo", "pan pa ya",
      "mercado", "supermercado", "bar", "sushi", "wok", "plural",
    ],
  ],
  [
    "Transporte",
    [
      "uber", "didi", "cabify", "indrive", "taxi", "terpel", "primax", "texaco",
      "biomax", "esso", "mobil", "gasolina", "parqueadero", "parking", "peaje",
      "metro", "tullave", "civica",
    ],
  ],
  ["Viajes", ["avianca", "latam", "wingo", "jetsmart", "airbnb", "booking", "hotel", "despegar", "viva air"]],
  ["Salud", ["farmacia", "drogueria", "cruz verde", "farmatodo", "colsubsidio", "clinica", "hospital", "laboratorio", "odontolog"]],
  ["Tecnologia", ["apple", "ktronix", "alkosto", "samsung", "mac center", "ishop", "steam", "playstation", "xbox", "google", "amazon web"]],
  ["Facturas", ["claro", "movistar", "tigo", "wom", "etb", "epm", "enel", "codensa", "vanti", "netflix", "spotify", "disney", "hbo", "youtube"]],
  ["Shopping", ["zara", "h&m", "falabella", "arturo calle", "studio f", "nike", "adidas", "mercadolibre", "amazon", "shein", "tennis", "koaj", "pull&bear", "bershka", "decathlon"]],
  ["Hogar", ["homecenter", "easy", "ikea", "tugo", "home sentry", "ferreteria"]],
  ["Educacion", ["universidad", "colegio", "platzi", "coursera", "udemy", "libreria", "panamericana"]],
]

/** Best-effort category from the merchant name; `fallback` when nothing matches. */
export function guessCategory(merchant: string | undefined, available?: string[], fallback = "Otro"): string {
  if (!merchant) return fallback
  // Pad with spaces so short keywords ("ara", "d1", "bar") only match whole words.
  const key = ` ${normalizeKey(merchant)} `
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (available && available.length > 0 && !available.includes(category)) continue
    const hit = keywords.some((kw) => (kw.length <= 4 ? key.includes(` ${kw} `) : key.includes(kw)))
    if (hit) return category
  }
  return fallback
}

/**
 * Finds the user's account for a "*1234" reference: the explicit mapping set
 * in the app first, then the only active card/account whose last 4 match.
 */
export function resolveAccountByLast4(
  last4Digits: string | null | undefined,
  accounts: Account[],
  accountMap: Record<string, string>,
): Account | null {
  if (!last4Digits) return null
  const usable = accounts.filter((a) => a.active !== false && (a.type === "debit" || a.type === "credit"))
  const mappedId = accountMap[last4Digits]
  if (mappedId) {
    const mapped = accounts.find((a) => a.id === mappedId && a.active !== false)
    if (mapped) return mapped
  }
  const matches = usable.filter((a) => "last4" in a && a.last4 === last4Digits)
  return matches.length === 1 ? matches[0] : null
}
