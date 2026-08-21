import { describe, expect, it } from "vitest";

import { buildAnalysisInput, hasUsableText } from "./build-input";

const project = {
  project_number: "2026-0142",
  name: "Sanitaire unit Zeewolde",
  description: "Vier identieke units",
  unit_type: "Sanitaire unit",
  quantity: 4,
};

const documents = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    fileName: "werkomschrijving.pdf",
    role: "offer" as const,
    pages: [
      "Werkomschrijving sanitaire unit, opdrachtgever gemeente Zeewolde. Aantal units: 4.",
      "Afmeting per unit 3000 x 2400 mm. Wanden voorzien van sandwichpanelen.",
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    fileName: "materiaallijst.pdf",
    role: "bill_of_materials" as const,
    pages: ["Materiaallijst behorend bij de werkomschrijving. Wandpanelen: 24 stuks."],
  },
];

describe("hasUsableText", () => {
  it("herkent documenten met voldoende tekst", () => {
    expect(hasUsableText(documents[0])).toBe(true);
  });

  it("wijst een lege of vrijwel lege scan af", () => {
    expect(hasUsableText({ id: "x", fileName: "scan.pdf", role: "drawing" as const, pages: [] })).toBe(false);
    expect(hasUsableText({ id: "x", fileName: "scan.pdf", role: "drawing" as const, pages: ["  ", "1"] })).toBe(false);
  });
});

describe("buildAnalysisInput", () => {
  it("neemt de projectgegevens op", () => {
    const input = buildAnalysisInput(project, documents);

    expect(input).toContain("2026-0142");
    expect(input).toContain("Sanitaire unit Zeewolde");
    expect(input).toContain("Aantal units: 4");
  });

  it("nummert documenten en pagina's, zodat bronverwijzing mogelijk is", () => {
    const input = buildAnalysisInput(project, documents);

    expect(input).toContain("## Document 1: werkomschrijving.pdf");
    expect(input).toContain("## Document 2: materiaallijst.pdf");
    expect(input).toContain("[pagina 1]");
    expect(input).toContain("[pagina 2]");
  });

  it("vult niet ingevulde projectvelden leesbaar in", () => {
    const input = buildAnalysisInput(
      { ...project, description: null, unit_type: null },
      documents,
    );

    expect(input).toContain("Type unit: niet ingevuld");
    expect(input).toContain("Omschrijving: niet ingevuld");
  });

  // Budget dat ruim genoeg is voor de kop en het korte tweede document, maar veel
  // te krap voor het opgeblazen eerste document. Afgeleid van de werkelijke lengte
  // in plaats van een vast getal, zodat de test niet breekt bij tekstwijzigingen.
  const groteDocumenten = [
    { ...documents[0], pages: ["Zeer lange werkomschrijving. ".repeat(200)] },
    documents[1],
  ];
  // De vaste staart (waarschuwing en opdracht) telt niet mee in het budget, dus
  // die trekken we eraf. Wat overblijft past net wel om het tweede document heen,
  // en te krap om ook maar een bruikbaar deel van het eerste mee te nemen.
  const krapBudget = buildAnalysisInput(project, [documents[1]]).length - 300;

  it("meldt expliciet welk document volledig is weggelaten bij overschrijding", () => {
    const input = buildAnalysisInput(project, groteDocumenten, krapBudget);

    expect(input).toContain("# Let op");
    expect(input).toContain("Volledig weggelaten vanwege lengte: Document 1 (werkomschrijving.pdf)");
    expect(input).toContain("Baseer geen bevindingen op wat je niet hebt gezien");
    expect(input).not.toContain("Zeer lange werkomschrijving.");
  });

  it("houdt documentnummers stabiel als een document wegvalt", () => {
    // Het nummer is de sleutel waarmee een bevinding aan een document wordt
    // gekoppeld. Zou nummering opschuiven bij weglaten, dan zou een bevinding aan
    // het verkeerde bestand worden toegeschreven.
    const input = buildAnalysisInput(project, groteDocumenten, krapBudget);

    expect(input).toContain("## Document 2: materiaallijst.pdf");
    expect(input).not.toContain("## Document 1:");
  });

  it("neemt een lang document gedeeltelijk mee en meldt dat het is afgekapt", () => {
    const lang = {
      id: "33333333-3333-4333-8333-333333333333",
      fileName: "bestek.pdf",
      role: "specification" as const,
      pages: ["Bestektekst. ".repeat(400)],
    };
    const budget = 2000;
    const input = buildAnalysisInput(project, [lang], budget);

    expect(input).toContain("## Document 1: bestek.pdf");
    expect(input).toContain("dit document is hier afgekapt");
    expect(input).toContain("Gedeeltelijk weggelaten");
    // De vaste staart (waarschuwing en opdracht) komt na het budget; die telt niet
    // mee in de afkapping, maar het geheel moet wel in de buurt blijven.
    expect(input.length).toBeLessThanOrEqual(budget + 600);
    expect(input.length).toBeGreaterThan(budget / 2);
  });

  it("laat geen waarschuwing zien wanneer alles past", () => {
    expect(buildAnalysisInput(project, documents)).not.toContain("# Let op");
  });

  it("vermeldt de documentrol bij elk document", () => {
    const input = buildAnalysisInput(project, documents);

    expect(input).toContain("rol: Offerte");
    expect(input).toContain("rol: Stuklijst");
  });

  it("benoemt welke vergelijkingen mogelijk zijn met de aanwezige rollen", () => {
    const input = buildAnalysisInput(project, documents);

    expect(input).toContain("Offerte tegenover stuklijst: mogelijk");
    expect(input).toContain("Offerte tegenover tekening: niet mogelijk");
  });

  it("vraagt expliciet om een lege lijst wanneer er niets te melden is", () => {
    expect(buildAnalysisInput(project, documents)).toContain("lege lijst");
  });
});
