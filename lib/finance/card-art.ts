import type { Account, CardNetwork } from "@/lib/types";
import { getCardPreset, matchCardPreset, type CardPreset } from "./card-presets";

export interface CardArt {
  /** Full CSS `background` value: pattern layer stacked over the base gradient. */
  background: string;
  border: string;
  textTone: "light" | "dark";
  /** Color for the network mark (Visa/Mastercard/Amex). */
  brandColor: string;
  wordmark?: string;
  wordmarkColor: string;
  network?: CardNetwork;
  /** A real photo supplied by the user — wins over the generated art. */
  imageUrl?: string;
}

const GENERIC_BY_NETWORK: Record<CardNetwork, string> = {
  visa: "visa-infinite-black",
  mastercard: "mastercard-world-black",
  amex: "amex-blue",
  other: "visa-infinite-black",
};

function toArt(preset: CardPreset, imageUrl?: string): CardArt {
  return {
    background: preset.pattern
      ? `${preset.pattern}, ${preset.gradient}`
      : preset.gradient,
    border: preset.border,
    textTone: preset.textTone,
    brandColor: preset.brandColor,
    wordmark: preset.wordmark,
    wordmarkColor: preset.wordmarkColor ?? preset.brandColor,
    network: preset.network,
    imageUrl: imageUrl || preset.imageUrl,
  };
}

/**
 * Art for a debit/credit account: the design of the real plastic, so the card
 * is recognisable at a glance the way it is in Apple Wallet. Returns
 * `undefined` for products that are not cards (fixed income, investments) —
 * those keep the plain app surface.
 */
export function resolveCardArt(account: Account): CardArt | undefined {
  if (account.type !== "debit" && account.type !== "credit") return undefined;
  return resolveCardArtFrom({
    presetId: account.presetId,
    institution: account.institution,
    name: account.name,
    type: account.type,
    network: account.network as CardNetwork | undefined,
    imageUrl: account.artImageUrl,
  });
}

/** Same resolution, from loose form fields (used by the live preview). */
export function resolveCardArtFrom({
  presetId,
  institution,
  name,
  type,
  network,
  imageUrl,
}: {
  presetId?: string;
  institution?: string;
  name?: string;
  type?: Account["type"];
  network?: CardNetwork;
  imageUrl?: string;
}): CardArt | undefined {
  const identity = `${institution ?? ""} ${name ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Type matters: the yellow debit is Mastercard, even on older accounts
  // created with the form's Visa default. Never infer an Amex as Visa Platinum.
  const bank = /bancolombia|banco colombia/.test(identity);
  const amexGold =
    bank && type === "credit" && (network === "amex" || /amex|american express/.test(identity)) && /gold|oro/.test(identity);
  const automaticId = bank && type === "debit" ? "bancolombia-debito"
    : amexGold ? "bancolombia-amex-gold"
    : bank && type === "credit" && (network === "visa" || /visa/.test(identity)) && !/infinite|oro|clasica|signature/.test(identity)
      ? "bancolombia-visa-platinum"
      : undefined;
  // A Bancolombia Amex Gold shows the bank's official art even if the generic
  // American Express Gold design was picked when the card was created.
  const chosenId = amexGold && presetId === "amex-gold" ? undefined : presetId;
  const preset =
    getCardPreset(chosenId) ??
    getCardPreset(automaticId) ??
    matchCardPreset(institution || name, network) ??
    getCardPreset(GENERIC_BY_NETWORK[network ?? "other"]);
  if (!preset) return undefined;

  const art = toArt(preset, imageUrl?.trim() || undefined);
  // The network the user picked always wins over the preset's own network.
  return network ? { ...art, network } : art;
}

/** Text colors that stay legible on top of the card art. */
export function artTextColors(tone: "light" | "dark") {
  return tone === "light"
    ? {
        label: "rgba(255,255,255,0.70)",
        value: "#ffffff",
        negative: "#ffb4a8",
      }
    : {
        label: "rgba(0,0,0,0.55)",
        value: "#111111",
        negative: "#8f1d14",
      };
}
