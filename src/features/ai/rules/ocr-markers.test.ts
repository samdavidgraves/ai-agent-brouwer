import { describe, expect, it } from "vitest";

import { detectScope, looksLikeMarker } from "./brouwer-rules";

/**
 * Regressie: de gescande opdrachtbevestiging van P251411 bevat OCR-fouten.
 * "Extra" werd "E)Ira", waardoor de meerwerkdetectie faalde op precies de regel
 * waar die het hardst nodig was.
 */
describe("OCR-tolerante herkenning van meerwerk", () => {
  it("herkent de verminkte regel uit de echte offerte", () => {
    expect(detectScope("- 5 stuks E)Íra wandcontactdoos, dubbelvoudig")).toBe("extra");
  });

  it("herkent de schone variant van dezelfde regel ook", () => {
    expect(detectScope("5 stuks Extra wandcontactdoos, du bbelvoudig 275,00")).toBe("extra");
  });

  it("herkent meerwerk nog steeds letterlijk", () => {
    expect(detectScope("Meerprijs 2x Kunststofschuifraam")).toBe("extra");
    expect(detectScope("Standaard inbegrepen in de basisuitvoering")).toBe("total");
  });

  it("laat een gewone regel met rust", () => {
    expect(detectScope("Legplank uit betonplex met opstaande rand")).toBe("unknown");
    expect(detectScope("Tafel en banken 2400mm")).toBe("unknown");
  });
});

describe("looksLikeMarker", () => {
  it("accepteert een OCR-verminking met niet-letters", () => {
    expect(looksLikeMarker("e)íra", "extra")).toBe(true);
    expect(looksLikeMarker("e)tra", "extra")).toBe(true);
  });

  it("weigert een ander woord van dezelfde lengte", () => {
    // Alleen letters afwijkend: dat is een ander woord, geen OCR-fout.
    expect(looksLikeMarker("estra", "extra")).toBe(false);
    expect(looksLikeMarker("petra", "extra")).toBe(false);
    expect(looksLikeMarker("intra", "extra")).toBe(false);
  });

  it("weigert bij een andere lengte of beginletter", () => {
    expect(looksLikeMarker("extras", "extra")).toBe(false);
    expect(looksLikeMarker(")xtra", "extra")).toBe(false);
  });

  it("weigert bij meer dan twee afwijkingen", () => {
    expect(looksLikeMarker("e)(*a", "extra")).toBe(false);
  });

  it("doet niets met korte markers", () => {
    expect(looksLikeMarker("op)", "opt")).toBe(false);
  });

  it("weigert een identiek woord als verminking", () => {
    // Letterlijke treffers gaan via de gewone zoekweg, niet hierlangs.
    expect(looksLikeMarker("extra", "extra")).toBe(false);
  });
});
