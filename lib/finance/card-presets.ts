import type { CardNetwork } from "@/lib/types";

export interface CardPreset {
  id: string;
  label: string;
  issuer: string;
  network: CardNetwork;
  institutionHint?: string;
  /** Bundled artwork sourced from the issuer; see public/cards/SOURCES.md. */
  imageUrl?: string;
  /** CSS background (gradients allowed). */
  gradient: string;
  border: string;
  /** "light" → white text; "dark" → near-black text. */
  textTone: "light" | "dark";
  /** Color for the brand logo SVG ("currentColor"). */
  brandColor: string;
  /** Optional issuer text shown top-left instead of institution. */
  brandText?: string;
  /**
   * Wordmark printed on the card face, the way it is on the real plastic. This
   * is what makes a card recognisable at a glance (à la Apple Wallet).
   */
  wordmark?: string;
  /** Color of the wordmark. Defaults to the text tone. */
  wordmarkColor?: string;
  /**
   * Extra CSS background layer stacked *above* `gradient` — the texture, sheen
   * or band that the real card carries. Kept separate so the resolver can drop
   * it when a user supplies their own photo.
   */
  pattern?: string;
  /** Institution names (lowercase, accent-free) that map onto this design. */
  match?: string[];
}

export const CARD_PRESETS: CardPreset[] = [
  {
    id: "bancolombia-visa-platinum", label: "Visa Platinum", issuer: "Bancolombia",
    institutionHint: "Bancolombia", network: "visa",
    imageUrl: "/cards/app/bancolombia-visa-platinum.webp",
    gradient: "#b6b6b6", border: "#a3a3a3", textTone: "dark", brandColor: "#111111",
  },
  {
    id: "bancolombia-amex-gold", label: "American Express Gold", issuer: "Bancolombia",
    institutionHint: "Bancolombia", network: "amex",
    imageUrl: "/cards/app/bancolombia-amex-gold.webp",
    gradient: "#c9a64a", border: "#a8862f", textTone: "dark", brandColor: "#111111",
  },
  {
    id: "arq", label: "ARQ Global", issuer: "ARQ", institutionHint: "ARQ",
    network: "mastercard", imageUrl: "/cards/app/arq-green.webp",
    gradient: "#082e20", border: "#174c33", textTone: "light", brandColor: "#f6efe4",
    match: ["arq", "dolarapp", "dolar app"],
  },
  {
    id: "apple-card",
    label: "Apple Card",
    issuer: "Apple",
    network: "mastercard",
    institutionHint: "Apple",
    gradient:
      "linear-gradient(135deg, #f4f4f4 0%, #e1e1e3 35%, #c8c8cc 70%, #b8b8bd 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.65) 0%, transparent 42%)",
    border: "#bdbdc2",
    textTone: "dark",
    brandColor: "#1a1a1a",
    brandText: " Card",
    wordmark: " Card",
    wordmarkColor: "#1a1a1a",
    match: ["apple", "apple card"],
  },
  {
    id: "chase-sapphire-reserve",
    label: "Sapphire Reserve",
    issuer: "Chase",
    network: "visa",
    institutionHint: "Chase",
    gradient:
      "radial-gradient(circle at 85% 0%, #2a5a9e 0%, transparent 55%), linear-gradient(135deg, #0a1f3d 0%, #061429 100%)",
    pattern:
      "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, transparent 45%)",
    border: "#1f3a66",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "CHASE",
    match: ["chase", "chase sapphire", "sapphire"],
  },
  {
    id: "chase-sapphire-preferred",
    label: "Sapphire Preferred",
    issuer: "Chase",
    network: "visa",
    institutionHint: "Chase",
    gradient: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 60%, #14276b 100%)",
    pattern:
      "linear-gradient(160deg, rgba(255,255,255,0.12) 0%, transparent 45%)",
    border: "#2952c4",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "CHASE",
  },
  {
    id: "amex-platinum",
    label: "Platinum",
    issuer: "American Express",
    network: "amex",
    institutionHint: "American Express",
    gradient: "linear-gradient(135deg, #d4d4d8 0%, #a1a1aa 40%, #71717a 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.55) 0%, transparent 40%)",
    border: "#a1a1aa",
    textTone: "dark",
    brandColor: "#1f1f1f",
    wordmark: "PLATINUM",
    match: ["amex", "american express", "amex platinum"],
  },
  {
    id: "amex-gold",
    label: "Gold",
    issuer: "American Express",
    network: "amex",
    institutionHint: "American Express",
    gradient: "linear-gradient(135deg, #f9d976 0%, #d4a544 50%, #a47715 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.45) 0%, transparent 40%)",
    border: "#c79a3f",
    textTone: "dark",
    brandColor: "#2a1f00",
    wordmark: "GOLD",
  },
  {
    id: "amex-blue",
    label: "Blue Cash",
    issuer: "American Express",
    network: "amex",
    institutionHint: "American Express",
    gradient: "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
    border: "#1e3a8a",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "BLUE",
  },
  {
    id: "bancolombia-mastercard",
    label: "Crédito Bancolombia",
    issuer: "Bancolombia",
    network: "mastercard",
    institutionHint: "Bancolombia",
    gradient: "linear-gradient(135deg, #fdd835 0%, #f9a825 100%)",
    pattern:
      "radial-gradient(circle at 92% 12%, rgba(255,255,255,0.45) 0%, transparent 45%)",
    border: "#f9a825",
    textTone: "dark",
    brandColor: "#1a1a1a",
    wordmark: "Bancolombia",
    wordmarkColor: "#0f0f0f",
    match: ["bancolombia", "banco colombia"],
  },
  {
    id: "bancolombia-debito",
    imageUrl: "/cards/app/bancolombia-debito.webp",
    label: "Débito Bancolombia",
    issuer: "Bancolombia",
    network: "mastercard",
    institutionHint: "Bancolombia",
    gradient: "linear-gradient(135deg, #003a70 0%, #00204a 100%)",
    pattern:
      "linear-gradient(115deg, transparent 66%, rgba(253,216,53,0.55) 100%)",
    border: "#ffdb00",
    textTone: "dark",
    brandColor: "#fff",
    wordmark: "Bancolombia",
    match: ["bancolombia", "banco colombia"],
  },
  {
    id: "nu-nubank",
    imageUrl: "/cards/app/nu-credit.webp",
    label: "Nu",
    issuer: "Nubank",
    network: "mastercard",
    institutionHint: "Nubank",
    gradient: "linear-gradient(135deg, #8a05be 0%, #5a0085 100%)",
    pattern:
      "radial-gradient(circle at 15% 85%, rgba(255,255,255,0.16) 0%, transparent 50%)",
    border: "#8a05be",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "nu",
    match: ["nu", "nubank", "nu colombia", "nu bank"],
  },
  {
    id: "nequi-visa",
    label: "Nequi",
    issuer: "Nequi",
    network: "visa",
    institutionHint: "Nequi",
    gradient: "linear-gradient(135deg, #2b0033 0%, #14001a 100%)",
    pattern:
      "radial-gradient(circle at 88% 18%, rgba(255,61,139,0.85) 0%, transparent 48%)",
    border: "#d6266f",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "nequi",
    wordmarkColor: "#ff3d8b",
    match: ["nequi"],
  },
  {
    id: "davivienda-mastercard",
    label: "Davivienda",
    issuer: "Davivienda",
    network: "mastercard",
    institutionHint: "Davivienda",
    gradient: "linear-gradient(135deg, #e3201c 0%, #a30f0c 100%)",
    pattern:
      "radial-gradient(circle at 90% 10%, rgba(255,255,255,0.22) 0%, transparent 45%)",
    border: "#e3201c",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Davivienda",
    match: ["davivienda", "daviplata"],
  },
  {
    id: "bbva-aqua",
    label: "BBVA Aqua",
    issuer: "BBVA",
    network: "visa",
    institutionHint: "BBVA",
    gradient: "linear-gradient(135deg, #072146 0%, #04152c 100%)",
    pattern:
      "linear-gradient(115deg, transparent 55%, rgba(73,165,230,0.75) 100%)",
    border: "#0077b6",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "BBVA",
    wordmarkColor: "#49a5e6",
    match: ["bbva", "bbva colombia"],
  },
  {
    id: "scotiabank-colpatria",
    label: "Scotiabank Colpatria",
    issuer: "Scotiabank Colpatria",
    network: "mastercard",
    institutionHint: "Scotiabank Colpatria",
    gradient: "linear-gradient(135deg, #ec111a 0%, #9c0a11 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, transparent 45%)",
    border: "#ec111a",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Scotiabank",
    match: ["scotiabank", "colpatria", "scotiabank colpatria"],
  },
  {
    id: "banco-bogota",
    label: "Banco de Bogotá",
    issuer: "Banco de Bogotá",
    network: "visa",
    institutionHint: "Banco de Bogotá",
    gradient: "linear-gradient(135deg, #002d62 0%, #001633 100%)",
    pattern:
      "radial-gradient(circle at 88% 15%, rgba(0,164,228,0.55) 0%, transparent 50%)",
    border: "#00a4e4",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Banco de Bogotá",
    match: ["banco de bogota", "bogota", "banco bogota"],
  },
  {
    id: "itau",
    label: "Itaú",
    issuer: "Itaú",
    network: "mastercard",
    institutionHint: "Itaú",
    gradient: "linear-gradient(135deg, #003c7d 0%, #00224a 100%)",
    pattern:
      "linear-gradient(115deg, transparent 58%, rgba(236,112,0,0.9) 100%)",
    border: "#ec7000",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Itaú",
    wordmarkColor: "#ec7000",
    match: ["itau", "itaú", "corpbanca"],
  },
  {
    id: "falabella-cmr",
    label: "CMR Falabella",
    issuer: "Banco Falabella",
    network: "visa",
    institutionHint: "Banco Falabella",
    gradient: "linear-gradient(135deg, #1f8f34 0%, #0d5c1f 100%)",
    pattern:
      "radial-gradient(circle at 90% 12%, rgba(255,255,255,0.24) 0%, transparent 48%)",
    border: "#1f8f34",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "CMR",
    match: ["falabella", "banco falabella", "cmr"],
  },
  {
    id: "lulo-bank",
    label: "Lulo Bank",
    issuer: "Lulo Bank",
    network: "visa",
    institutionHint: "Lulo Bank",
    gradient: "linear-gradient(135deg, #1b1b1b 0%, #050505 100%)",
    pattern:
      "radial-gradient(circle at 85% 15%, rgba(214,255,0,0.85) 0%, transparent 42%)",
    border: "#d6ff00",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "lulo",
    wordmarkColor: "#d6ff00",
    match: ["lulo", "lulo bank"],
  },
  {
    id: "rappicard",
    imageUrl: "/cards/app/rappicard.webp",
    label: "RappiCard",
    issuer: "RappiCard",
    network: "visa",
    institutionHint: "RappiCard",
    gradient: "linear-gradient(135deg, #161616 0%, #000000 100%)",
    pattern:
      "linear-gradient(115deg, transparent 62%, rgba(255,68,31,0.9) 100%)",
    border: "#343541",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Rappi",
    wordmarkColor: "#ff441f",
    match: ["rappi", "rappicard", "rappi card"],
  },
  {
    id: "revolut-metal",
    label: "Revolut Metal",
    issuer: "Revolut",
    network: "visa",
    institutionHint: "Revolut",
    gradient: "linear-gradient(135deg, #2b2b30 0%, #0b0b0d 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.22) 0%, transparent 38%)",
    border: "#3a3a42",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Revolut",
    match: ["revolut"],
  },
  {
    id: "wise",
    label: "Wise",
    issuer: "Wise",
    network: "mastercard",
    institutionHint: "Wise",
    gradient: "linear-gradient(135deg, #163300 0%, #0a1a00 100%)",
    pattern:
      "radial-gradient(circle at 88% 14%, rgba(159,232,112,0.9) 0%, transparent 45%)",
    border: "#9fe870",
    textTone: "light",
    brandColor: "#fff",
    wordmark: "Wise",
    wordmarkColor: "#9fe870",
    match: ["wise", "transferwise"],
  },
  {
    id: "visa-infinite-black",
    label: "Visa Infinite",
    issuer: "Genérica",
    network: "visa",
    gradient: "linear-gradient(135deg, #1a1a1a 0%, #000000 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 40%)",
    border: "#3a3a3a",
    textTone: "light",
    brandColor: "#fff",
  },
  {
    id: "mastercard-world-black",
    label: "World Black",
    issuer: "Genérica",
    network: "mastercard",
    gradient: "linear-gradient(135deg, #2d2d2d 0%, #0a0a0a 100%)",
    pattern:
      "linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 40%)",
    border: "#3a3a3a",
    textTone: "light",
    brandColor: "#fff",
  },
];

export function getCardPreset(id?: string): CardPreset | undefined {
  if (!id) return undefined;
  return CARD_PRESETS.find((p) => p.id === id);
}

/** Lowercase + strip accents so "Itaú" and "itau" match the same design. */
const RX = /[\u0300-\u036f]/g;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(RX, "")
    .trim();
}

/**
 * Best-effort mapping from a free-text institution name to a real card design.
 * Prefers a design whose network also matches so a Bancolombia Visa débito does
 * not come back wearing the Mastercard crédito art.
 */
export function matchCardPreset(
  institution?: string,
  network?: CardNetwork,
): CardPreset | undefined {
  if (!institution) return undefined;
  const inst = normalize(institution).replace(/[^a-z0-9]+/g, " ").trim();
  if (!inst) return undefined;

  const hits = CARD_PRESETS.filter((p) =>
    p.match?.some((m) => ` ${inst} `.includes(` ${normalize(m).replace(/[^a-z0-9]+/g, " ").trim()} `)),
  );
  if (hits.length === 0) return undefined;
  return hits.find((p) => p.network === network) ?? hits[0];
}
