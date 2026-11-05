import { describe, expect, it } from "vitest"
import { resolveCardArtFrom } from "./card-art"

describe("resolveCardArtFrom · Bancolombia Amex Gold", () => {
  const gold = "/cards/app/bancolombia-amex-gold.webp"

  it("uses the official art for a Bancolombia Amex Gold", () => {
    const art = resolveCardArtFrom({ institution: "Bancolombia", name: "Amex gold Bancolombia", type: "credit", network: "amex" })
    expect(art?.imageUrl).toBe(gold)
    expect(art?.network).toBe("amex")
  })

  it("replaces the generic Gold design picked at creation", () => {
    const art = resolveCardArtFrom({ presetId: "amex-gold", institution: "Bancolombia", name: "Amex Gold", type: "credit", network: "amex" })
    expect(art?.imageUrl).toBe(gold)
  })

  it("keeps the Visa Platinum for other Bancolombia Visa cards", () => {
    const art = resolveCardArtFrom({ institution: "Bancolombia", name: "Visa Bancolombia Platino", type: "credit", network: "visa" })
    expect(art?.imageUrl).toBe("/cards/app/bancolombia-visa-platinum.webp")
  })

  it("does not apply to a non-Bancolombia Amex Gold", () => {
    const art = resolveCardArtFrom({ institution: "American Express", name: "Gold", type: "credit", network: "amex" })
    expect(art?.imageUrl).toBeUndefined()
  })
})
