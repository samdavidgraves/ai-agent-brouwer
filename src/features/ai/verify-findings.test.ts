import { describe, expect, it } from "vitest";

import { MAX_FINDINGS } from "./limits";
import type { RawAiFinding } from "./schema";
import { findQuotePage, normalizeForMatching, verifyFindings } from "./verify-findings";

const documents = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    fileName: "werkomschrijving.pdf",
    role: "drawing" as const,
    pages: [
      "Werkomschrijving unit 12\nOpdrachtgever: gemeente Zeewolde",
      "Aantal units: 4\nAfmeting: 3000 x 2400 mm",
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    fileName: "materiaallijst.pdf",
    role: "bill_of_materials" as const,
    pages: ["Materiaallijst\nAantal units: 6\nWandpanelen: 24 stuks"],
  },
];

function finding(overrides: Partial<RawAiFinding> = {}): RawAiFinding {
  return {
    finding_type: "discrepancy",
    check_area: "offer_vs_drawing",
    severity: "high",
    category: "quantity",
    title: "Aantal units wijkt af",
    description: "De werkomschrijving noemt 4 units, de materiaallijst 6.",
    source_document_index: 1,
    source_page: 2,
    source_quote: "Aantal units: 4",
    compared_document_index: null,
    compared_page: null,
    compared_quote: "",
    ...overrides,
    confidence: "high",
  };
}

describe("normalizeForMatching", () => {
  it("maakt regelafbrekingen en dubbele spaties onzichtbaar", () => {
    expect(normalizeForMatching("Aantal   units:\n4")).toBe("aantal units: 4");
  });

  it("gelijkt typografische aanhalingstekens en streepjes", () => {
    expect(normalizeForMatching("“maat” – 3000")).toBe('"maat" - 3000');
  });
});

describe("findQuotePage", () => {
  it("vindt een passage en geeft het paginanummer", () => {
    expect(findQuotePage(documents[0].pages, "Aantal units: 4")).toBe(2);
    expect(findQuotePage(documents[0].pages, "Opdrachtgever: gemeente Zeewolde")).toBe(1);
  });

  it("trekt zich niets aan van afwijkende witruimte", () => {
    expect(findQuotePage(documents[0].pages, "Aantal   units:\n\n4")).toBe(2);
  });

  it("vindt een passage die over een paginagrens loopt", () => {
    expect(findQuotePage(documents[0].pages, "gemeente Zeewolde Aantal units: 4")).toBe(1);
  });

  it("geeft null voor een passage die er niet staat", () => {
    expect(findQuotePage(documents[0].pages, "Aantal units: 9")).toBeNull();
    expect(findQuotePage(documents[0].pages, "")).toBeNull();
  });
});

describe("verifyFindings", () => {
  it("neemt een bevinding met controleerbare bron over", () => {
    const { accepted, rejected } = verifyFindings([finding()], documents);

    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({
      finding_type: "discrepancy",
      check_area: "offer_vs_drawing",
      source_document_id: documents[0].id,
      compared_document_id: null,
      source_reference: "Pagina 2",
      source_quote: "Aantal units: 4",
      severity: "high",
      category: "quantity",
      confidence: "high",
    });
  });

  it("verwerpt een verzonnen passage", () => {
    const { accepted, rejected } = verifyFindings(
      [finding({ source_quote: "Aantal units: 9 en een gasaansluiting" })],
      documents,
    );

    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toContain("niet terug te vinden");
  });

  it("corrigeert een fout paginanummer naar de echte vindplaats", () => {
    const { accepted } = verifyFindings([finding({ source_page: 7 })], documents);

    expect(accepted[0].source_reference).toBe("Pagina 2");
  });

  it("verwerpt een verwijzing naar een document dat niet bestaat", () => {
    const { accepted, rejected } = verifyFindings(
      [finding({ source_document_index: 5 })],
      documents,
    );

    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toContain("niet bestaat");
  });

  it("verwerpt een citaat dat te kort is om te controleren", () => {
    const { accepted, rejected } = verifyFindings([finding({ source_quote: "4" })], documents);

    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toContain("te kort");
  });

  it("verwerpt een bevinding zonder titel of uitleg", () => {
    const { accepted, rejected } = verifyFindings(
      [finding({ title: "   " }), finding({ description: "" })],
      documents,
    );

    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toContain("titel of uitleg");
  });

  it("koppelt de bevinding aan het juiste document", () => {
    const { accepted } = verifyFindings(
      [finding({ source_document_index: 2, source_quote: "Wandpanelen: 24 stuks" })],
      documents,
    );

    expect(accepted[0].source_document_id).toBe(documents[1].id);
    expect(accepted[0].source_reference).toBe("Pagina 1");
  });

  it("begrenst het aantal bevindingen", () => {
    const many = Array.from({ length: MAX_FINDINGS + 5 }, () => finding());
    const { accepted, rejected } = verifyFindings(many, documents);

    expect(accepted).toHaveLength(MAX_FINDINGS);
    expect(rejected).toHaveLength(5);
  });

  it("koppelt het vergeleken document inclusief geverifieerd tweede citaat", () => {
    const { accepted } = verifyFindings(
      [finding({ compared_document_index: 2, compared_quote: "Wandpanelen: 24 stuks" })],
      documents,
    );

    expect(accepted[0].compared_document_id).toBe(documents[1].id);
    expect(accepted[0].compared_reference).toBe("Pagina 1");
    expect(accepted[0].compared_quote).toBe("Wandpanelen: 24 stuks");
  });

  it("laat de tweede bron vallen als dat citaat niet terugvindbaar is", () => {
    const { accepted, rejected } = verifyFindings(
      [finding({ compared_document_index: 2, compared_quote: "Deze regel bestaat nergens" })],
      documents,
    );

    // De bevinding blijft geldig: de primaire bron draagt de bewijslast.
    expect(rejected).toHaveLength(0);
    expect(accepted[0].compared_document_id).toBeNull();
    expect(accepted[0].compared_quote).toBeNull();
  });

  it("laat een onbekend vergelijkingsdocument vallen zonder de bevinding te verwerpen", () => {
    const { accepted, rejected } = verifyFindings(
      [finding({ compared_document_index: 9 })],
      documents,
    );

    expect(rejected).toHaveLength(0);
    expect(accepted[0].compared_document_id).toBeNull();
  });

  it("neemt finding_type en check_area ongewijzigd over", () => {
    const { accepted } = verifyFindings(
      [finding({ finding_type: "attention", check_area: "dimensions" })],
      documents,
    );

    expect(accepted[0].finding_type).toBe("attention");
    expect(accepted[0].check_area).toBe("dimensions");
  });

  it("levert niets op bij een leeg antwoord", () => {
    const { accepted, rejected } = verifyFindings([], documents);

    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});
