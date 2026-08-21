import { describe, expect, it } from "vitest";

import { parseAiResponse } from "./schema";

const validFinding = {
  finding_type: "discrepancy",
  check_area: "offer_vs_drawing",
  severity: "high",
  category: "quantity",
  title: "Aantal units wijkt af",
  description: "De werkomschrijving noemt 4 units, de materiaallijst 6.",
  source_document_index: 1,
  source_page: 2,
  source_quote: "Aantal units: 4",
  compared_document_index: 2,
  compared_page: 1,
  compared_quote: "3 plafondarmaturen",
  confidence: "high",
};

describe("parseAiResponse", () => {
  it("accepteert een correct antwoord", () => {
    const result = parseAiResponse({ findings: [validFinding] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.findings).toHaveLength(1);
      expect(result.response.findings[0].title).toBe("Aantal units wijkt af");
    }
  });

  it("accepteert een lege lijst bevindingen", () => {
    const result = parseAiResponse({ findings: [] });

    expect(result.ok).toBe(true);
  });

  it("accepteert een onbekend paginanummer als null", () => {
    const result = parseAiResponse({ findings: [{ ...validFinding, source_page: null }] });

    expect(result.ok).toBe(true);
  });

  it("wijst een onbekende severity af", () => {
    const result = parseAiResponse({ findings: [{ ...validFinding, severity: "kritiek" }] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("severity");
  });

  it("wijst een onbekend finding_type af", () => {
    const result = parseAiResponse({ findings: [{ ...validFinding, finding_type: "fout" }] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("finding_type");
  });

  it("wijst een onbekend controlegebied af", () => {
    const result = parseAiResponse({ findings: [{ ...validFinding, check_area: "elektra" }] });

    expect(result.ok).toBe(false);
  });

  it("accepteert alle drie de finding types", () => {
    for (const type of ["discrepancy", "missing", "attention"]) {
      expect(parseAiResponse({ findings: [{ ...validFinding, finding_type: type }] }).ok).toBe(true);
    }
  });

  it("accepteert alle vijf de controlegebieden", () => {
    const areas = ["offer_vs_drawing", "drawing_vs_bom", "offer_vs_bom", "dimensions", "location"];
    for (const area of areas) {
      expect(parseAiResponse({ findings: [{ ...validFinding, check_area: area }] }).ok).toBe(true);
    }
  });

  it("wijst een onbekende categorie af", () => {
    const result = parseAiResponse({ findings: [{ ...validFinding, category: "veiligheid" }] });

    expect(result.ok).toBe(false);
  });

  it("wijst een ontbrekend veld af", () => {
    const withoutQuote: Record<string, unknown> = { ...validFinding };
    delete withoutQuote.source_quote;
    const result = parseAiResponse({ findings: [withoutQuote] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("source_quote");
  });

  it("wijst een niet-geheel documentnummer af", () => {
    const result = parseAiResponse({
      findings: [{ ...validFinding, source_document_index: 1.5 }],
    });

    expect(result.ok).toBe(false);
  });

  it("wijst antwoorden zonder findings-lijst af", () => {
    expect(parseAiResponse({}).ok).toBe(false);
    expect(parseAiResponse({ findings: "geen" }).ok).toBe(false);
    expect(parseAiResponse(null).ok).toBe(false);
    expect(parseAiResponse("vrije tekst van het model").ok).toBe(false);
  });
});
