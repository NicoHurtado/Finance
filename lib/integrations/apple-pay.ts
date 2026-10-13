import type { Account } from "@/lib/types"

/**
 * Pure helpers for the Apple Pay (iOS Shortcuts "Transaction" automation)
 * integration. Kept free of server-only imports so they can be unit tested.
 */

/**
 * Parses the amount Shortcuts sends. The "Amount" variable is a currency value
 * that turns into locale-formatted text when placed in a JSON body, e.g.
 * "$45.900,00", "COP 45.900", "$ 12,50", "US$12.50" or a plain number.
 * Returns null when no positive amount can be read.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null
  if (typeof value !== "string") return null

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
    // "45.900" / "1,250,000" → thousands. "12,50" / "9.5" → decimals.
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

/**
 * Key under which a Wallet card name is stored in the card → account map.
 * "." and "$" are replaced so the name is safe as a MongoDB field name.
 */
export function cardKey(cardName: string): string {
  return normalizeKey(cardName).replace(/[.$]/g, "_")
}

const CATEGORY_KEYWORDS: Array<[category: string, keywords: string[]]> = [
  [
    "Comida",
    [
      "rappi", "ifood", "didi food", "restaurante", "restaurant", "cafe", "coffee",
      "juan valdez", "starbucks", "tostao", "crepes", "frisby", "kfc", "mcdonald",
      "burger", "el corral", "subway", "domino", "pizza", "panaderia", "exito",
      "carulla", "jumbo", "olimpica", "ara", "d1", "oxxo", "isimo", "pan pa ya",
      "mercado", "supermercado", "bar ", "sushi", "wok",
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

/** Best-effort category from the merchant name; "Otro" when nothing matches. */
export function guessCategory(merchant: string | undefined, available?: string[]): string {
  const fallback = "Otro"
  if (!merchant) return fallback
  // Pad with spaces so short keywords ("ara", "d1", "bar ") only match whole words.
  const key = ` ${normalizeKey(merchant)} `
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (available && available.length > 0 && !available.includes(category)) continue
    const hit = keywords.some((kw) =>
      kw.length <= 4 ? key.includes(` ${kw.trim()} `) : key.includes(kw),
    )
    if (hit) return category
  }
  return fallback
}

export interface ApplePayConfig {
  /** cardKey(Wallet card name) → accountId. */
  cardMap: Record<string, string>
  defaultAccountId?: string
}

/**
 * Picks the account for a Wallet card name: explicit mapping first, then a
 * match on last 4 digits / account name / institution, then the default.
 */
export function resolveAccount(
  cardName: string | undefined,
  accounts: Account[],
  config: ApplePayConfig,
): Account | null {
  const usable = accounts.filter((a) => a.active !== false && (a.type === "debit" || a.type === "credit"))
  const byId = (id: string | undefined) => (id ? usable.find((a) => a.id === id) ?? null : null)

  if (cardName) {
    const key = normalizeKey(cardName)
    const mapped = byId(config.cardMap[cardKey(cardName)])
    if (mapped) return mapped

    const digits: string[] = key.match(/\d{4}/g) ?? []
    const byLast4 = usable.filter((a) => "last4" in a && a.last4 && digits.includes(a.last4))
    if (byLast4.length === 1) return byLast4[0]

    const byName = usable.filter((a) => {
      const name = normalizeKey(a.name)
      return name.length > 1 && (key.includes(name) || name.includes(key))
    })
    if (byName.length === 1) return byName[0]

    const byInstitution = usable.filter((a) => {
      const inst = normalizeKey(a.institution)
      return inst.length > 1 && key.includes(inst)
    })
    if (byInstitution.length === 1) return byInstitution[0]
  }

  return byId(config.defaultAccountId)
}
