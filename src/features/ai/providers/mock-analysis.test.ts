import { describe, expect, it } from "vitest";

import { MAX_PLAUSIBLE_COUNT } from "@/features/ai/limits";
import { findItem } from "@/features/ai/rules/brouwer-rules";
import { verifyFindings, type AnalysisDocument } from "@/features/ai/verify-findings";
import type { BomArticle } from "@/features/documents/parsers";
import { analyseDocuments, comparable, extractCount, isExcluded, tallyDocument } from "./mock-analysis";

function doc(
  id: string,
  fileName: string,
  role: AnalysisDocument["role"],
  pages: string[],
): AnalysisDocument {
  return { id, fileName, role, pages };
}

/** Stuklijst zoals de xlsx-parser hem oplevert: artikelen plus canonieke tekst. */
function bomDoc(
  id: string,
  articles: { number: string; description: string; total: number; unit?: string }[],
  subprojectCount = 1,
): AnalysisDocument {
  const parsed: BomArticle[] = articles.map((a) => ({
    articleNumber: a.number,
    description: a.description,
    unit: a.unit ?? "Stuks",
    totalAmount: a.total,
    perSubproject: new Map(),
    rowCount: 1,
  }));

  const lines = parsed.map(
    (a) =>
      `${a.articleNumber} | ${a.description} | ${a.totalAmount} ${a.unit}` +
      (subprojectCount > 1 ? ` (${a.totalAmount / subprojectCount} per subproject)` : ""),
  );

  return {
    id,
    fileName: "stuklijst.xlsx",
    role: "bill_of_materials",
    pages: [["Stuklijst stuklijst.xlsx", `Artikelen: ${parsed.length}`, "", ...lines].join("\n")],
    articles: parsed,
    subprojectCount,
  };
}

const offerte = doc("11111111-1111-4111-8111-111111111111", "offerte.pdf", "offer", [
  [
    "Offerte 2026-0142 sanitaire unit",
    "2 tafels",
    "4 banken",
    "6 WCD's",
    "4 plafondarmaturen",
    "1 LED-strip schaftruimte",
  ].join("\n"),
]);

const tekening = doc("22222222-2222-4222-8222-222222222222", "tekening.pdf", "drawing", [
  [
    "Plattegrond sanitaire unit",
    "2 tafels",
    "4 banken",
    "6 WCD's aan de achterwand",
    "3 plafondarmaturen",
  ].join("\n"),
]);

describe("extractCount", () => {
  const armatuur = findItem("plafondarmatuur")!;
  const bank = findItem("bank")!;
  const wcd = findItem("wcd")!;

  it("leest een aantal dat voor het onderdeel staat", () => {
    expect(extractCount("4 plafondarmaturen", armatuur)).toBe(4);
  });

  it("leest een aantal dat achter het onderdeel staat", () => {
    expect(extractCount("plafondarmaturen: 3", armatuur)).toBe(3);
    expect(extractCount("plafondarmaturen 8 stuks", armatuur)).toBe(8);
  });

  it("leest een uitgeschreven getal", () => {
    expect(extractCount("vier banken", bank)).toBe(4);
  });

  // Zoals het in de echte opdrachtbevestiging van P251411 staat.
  it("leest 'N stuks' met woorden tussen getal en onderdeel", () => {
    expect(extractCount("- 5 stuks Extra wandcontactdoos, dubbelvoudig", wcd)).toBe(5);
  });

  it("leest '(2x)' achter het onderdeel", () => {
    const legplank = findItem("legplank")!;

    expect(extractCount("Legplank (2x) in de kast", legplank)).toBe(2);
  });

  it("telt een accessoireregel niet als het onderdeel zelf", () => {
    // "Bankdeksels" bevat wel het woord bank, maar is een ander artikel; de
    // uitsluitwoorden vangen die regel af.
    expect(isExcluded("Bankdeksels (2x) met skaikussens", bank)).toBe(true);
  });

  it("houdt een maatvoering niet voor een aantal", () => {
    expect(extractCount("banken 1200 mm breed", bank)).toBeNull();
  });

  it("geeft null wanneer er geen aantal in de regel staat", () => {
    expect(extractCount("plafondarmaturen aanwezig", armatuur)).toBeNull();
  });
});

// --- Regressie: technische waarden zijn geen aantallen ---------------------

describe("regressie: eenheden worden niet als aantal gelezen", () => {
  const led = findItem("led_strip")!;
  const bank = findItem("bank")!;
  const tafel = findItem("tafel")!;

  it("leest een spanning niet als aantal", () => {
    // Uit de echte offerte van P251411: gaf eerder aantal 24.
    expect(extractCount("- Led-strip 24 Volt 4000 Kelvin lP 68 in schaftruimte", led)).toBeNull();
    expect(extractCount("Led-strip 24V 4000 Kelvin IP68", led)).toBeNull();
  });

  it("leest een maat met eenheid niet als aantal", () => {
    // Gaf eerder 240: de regex viel terug op drie cijfers zodat "0mm" geen
    // eenheid meer leek.
    expect(extractCount("Tafel+ bank 2400mm", bank)).toBeNull();
    expect(extractCount("Legplank 400x1040mm, 10cm hoge rand", findItem("legplank")!)).toBeNull();
  });

  it("weigert een onwaarschijnlijk hoog aantal", () => {
    // "Tafel 2400" is een maat zonder eenheid; 2400 tafels bestaat niet.
    expect(extractCount("1140+vl Tafel 2400 + bank (2x1200)", tafel)).toBeNull();
    expect(extractCount(`${MAX_PLAUSIBLE_COUNT + 1} banken`, bank)).toBeNull();
  });

  it("leest een OCR-verminkte spanning niet als aantal", () => {
    // Uit de echte offerte: "24 Volt 4000" werd door OCR "24Vo114000".
    // De eenhedenlijst alleen hielp hier niet; een getal dat aan een letter
    // vastplakt is nooit een aantal.
    expect(
      extractCount("Led-strip 24Vo114000 Kelvin lP 68 in schaftruimte", led),
    ).toBeNull();
  });

  it("laat een plausibel aantal wel door", () => {
    expect(extractCount(`${MAX_PLAUSIBLE_COUNT} banken`, bank)).toBe(MAX_PLAUSIBLE_COUNT);
    expect(extractCount("4 banken", bank)).toBe(4);
  });

  it("leest een samenstelling niet als aantal", () => {
    // Deze test verwachtte eerder 2. Brouwer heeft bevestigd dat "(2x1200)" een
    // productieverduidelijking is: één bank van 2400 mm uit twee modules van
    // 1200 mm. Het is dus geen telling van banken.
    expect(extractCount("1140+vl Tafel 2400 + bank (2x1200)", bank)).toBeNull();
    // Met een spatie ertussen blijft het wel een telling.
    expect(extractCount("Bank 3x 2400mm langs wand A", bank)).toBe(3);
  });
});

describe("uitsluitwoorden tegen vals-positieven", () => {
  const deur = findItem("deur")!;
  const tafel = findItem("tafel")!;
  const bank = findItem("bank")!;

  it("telt accessoires op een deur niet als deur", () => {
    expect(isExcluded("- 2 stuks Stormketting op de buitendeur", deur)).toBe(true);
    expect(isExcluded("Veiligheidsbeslag SKG.. op de deur", deur)).toBe(true);
  });

  it("telt een locatie-aanduiding niet als tafel", () => {
    expect(isExcluded("Positie:Midden boven de tafel", tafel)).toBe(true);
  });

  it("telt bankonderdelen niet als bank", () => {
    expect(isExcluded("Bankdeksels (2x) met skaikussens", bank)).toBe(true);
    expect(isExcluded("Rugleuning (2x) t.b.v. bank", bank)).toBe(true);
    expect(isExcluded("Bankdeksel 1200mm bekleden met skai diepte: 44 cm", bank)).toBe(true);
  });

  // Regressie: het rugleuning-filter sloot juist de bank zelf uit.
  it("telt de bank zelf wel mee, ook met een rugleuning erin", () => {
    expect(
      isExcluded(
        "Opbergbank met rugleuning 1200mm (breedte bank) x 515mm (diepte opbergbank)",
        bank,
      ),
    ).toBe(false);
    expect(isExcluded("Bank met rugleuning", bank)).toBe(false);
  });

  it("matcht een losse rugleuning sowieso niet als bank", () => {
    // "Skairugleuning" bevat geen enkel bank-synoniem.
    const regel = "Skairugleuning 1200 mm met aluminium montagebeugels";
    expect(bank.synonyms.some((w) => regel.toLowerCase().includes(w))).toBe(false);
  });

  it("laat een echte onderdeelregel wel door", () => {
    expect(isExcluded("4 banken", bank)).toBe(false);
    expect(isExcluded("2 deuren", deur)).toBe(false);
  });
});

// --- Test F: standaard en meerwerk niet blind optellen ----------------------

describe("Test F: aantallen worden niet blind vergeleken", () => {
  it("vergelijkt twee beschrijvende bronnen zonder meerwerk-aanduiding wel", () => {
    expect(comparable("plafondarmatuur", "unknown", "unknown")).toEqual({ ok: true });
  });

  it("vergelijkt meerwerk niet met een onbekende grootheid", () => {
    const verdict = comparable("wcd", "extra", "unknown");

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("meerwerk");
  });

  it("vergelijkt meerwerk niet met een totaal", () => {
    const verdict = comparable("wcd", "extra", "total");

    expect(verdict.ok).toBe(false);
  });

  it("vergelijkt een standaardonderdeel niet met een stuklijsttotaal", () => {
    const verdict = comparable("wcd", "unknown", "total", { targetIsTotal: true });

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("standaard");
  });

  it("vergelijkt twee keer meerwerk wel", () => {
    expect(comparable("wcd", "extra", "extra")).toEqual({ ok: true });
  });

  it("levert bij het echte WCD-geval een aandachtspunt op, geen afwijking", () => {
    const echteOfferte = doc("aaaa1111-1111-4111-8111-111111111111", "offerte.pdf", "offer", [
      ["Opdrachtbevestiging", "- 5 stuks Extra wandcontactdoos, dubbelvoudig"].join("\n"),
    ]);
    const echteTekening = doc("bbbb2222-2222-4222-8222-222222222222", "vk01.pdf", "drawing", [
      ["Verkooptekening", "Extra WCD in berging", "Extra WCD links in hoek"].join("\n"),
    ]);

    const findings = analyseDocuments([echteOfferte, echteTekening]);
    const wcd = findings.filter((f) => f.title.toLowerCase().includes("wcd"));

    expect(wcd.length).toBeGreaterThan(0);
    expect(wcd.every((f) => f.finding_type !== "discrepancy")).toBe(true);
  });
});

// --- Scenario's A t/m E ----------------------------------------------------

describe("Scenario A: offerte 4 plafondarmaturen, tekening 3", () => {
  const findings = analyseDocuments([offerte, tekening]);

  it("levert een afwijking op", () => {
    const armatuur = findings.find(
      (f) => f.check_area === "offer_vs_drawing" && f.title.includes("plafondarmaturen"),
    );

    expect(armatuur).toBeDefined();
    expect(armatuur!.finding_type).toBe("discrepancy");
    expect(armatuur!.severity).toBe("high");
  });

  it("draagt citaten uit beide documenten", () => {
    const armatuur = findings.find((f) => f.title.includes("plafondarmaturen"))!;

    expect(armatuur.source_quote).toContain("4 plafondarmaturen");
    expect(armatuur.compared_document_index).toBe(2);
    expect(armatuur.compared_quote).toContain("3 plafondarmaturen");
  });
});

describe("Scenario B: offerte met LED-strip, tekening zonder", () => {
  it("levert een mogelijk ontbrekend onderdeel op", () => {
    const findings = analyseDocuments([offerte, tekening]);
    const led = findings.find(
      (f) => f.check_area === "offer_vs_drawing" && f.title.includes("LED-strip"),
    );

    expect(led).toBeDefined();
    expect(led!.finding_type).toBe("missing");
    expect(led!.source_quote).toBe("1 LED-strip schaftruimte");
  });
});

describe("Scenario C: legplank zonder hoogte", () => {
  const metLegplank = doc("44444444-4444-4444-8444-444444444444", "tekening.pdf", "drawing", [
    ["Plattegrond kleedruimte", "2 legplanken aan de zijwand", "1 bank"].join("\n"),
  ]);

  it("levert een aandachtspunt op, geen afwijking", () => {
    const maat = analyseDocuments([metLegplank]).find((f) => f.check_area === "dimensions");

    expect(maat).toBeDefined();
    expect(maat!.finding_type).toBe("attention");
    expect(maat!.severity).toBe("low");
  });

  it("neemt geen aanname over wat de juiste hoogte zou zijn", () => {
    const maat = analyseDocuments([metLegplank]).find((f) => f.check_area === "dimensions")!;

    expect(maat.description).not.toMatch(/\d+\s*mm/);
    expect(maat.description).toContain("niet vastgelegd dat deze maat verplicht is");
  });

  it("meldt niets zodra er wel een hoogte staat", () => {
    const metHoogte = doc("55555555-5555-4555-8555-555555555555", "tekening.pdf", "drawing", [
      ["Plattegrond kleedruimte", "2 legplanken, hoogte 1200 mm"].join("\n"),
    ]);

    expect(analyseDocuments([metHoogte]).filter((f) => f.check_area === "dimensions")).toHaveLength(0);
  });
});

describe("Scenario D: offerte, tekening en stuklijst komen overeen", () => {
  it("levert geen enkele constatering op", () => {
    const gelijk = [
      doc("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "offerte.pdf", "offer", [
        ["Offerte", "2 tafels in de schaftruimte", "4 banken 1200mm in de schaftruimte"].join("\n"),
      ]),
      doc("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "tekening.pdf", "drawing", [
        ["Plattegrond", "2 tafels in de schaftruimte", "4 banken 1200mm in de schaftruimte"].join("\n"),
      ]),
      // De bevestigde artikelnummers, zodat dit scenario de gekoppelde route
      // aflegt: 4 banken van 1200 mm zijn 4 modules, en dat is wat er staat.
      bomDoc("cccccccc-cccc-4ccc-8ccc-cccccccccccc", [
        { number: "11800291", description: "Tafelblad 2400 x 550 mm schaftruimte", total: 2 },
        { number: "11810018", description: "Opbergbank met rugleuning 1200mm", total: 4 },
      ]),
    ];

    expect(analyseDocuments(gelijk)).toEqual([]);
  });
});

describe("Scenario E: stuklijst wijkt af van de offerte", () => {
  it("meldt het als aandachtspunt zolang de artikelkoppeling niet bevestigd is", () => {
    const bom = bomDoc("dddddddd-dddd-4ddd-8ddd-dddddddddddd", [
      { number: "1002", description: "Bank 2400mm", total: 6 },
      { number: "1001", description: "Tafel 2400mm", total: 2 },
      { number: "1003", description: "Plafondarmatuur met sensor", total: 6 },
      { number: "1004", description: "LED-strip 24V", total: 1 },
      { number: "1005", description: "WCD 1-voudig", total: 6 },
    ]);

    const findings = analyseDocuments([offerte, bom]);
    // Voor plafondarmaturen is bewust geen artikelkoppeling vastgelegd.
    const armaturen = findings.find(
      (f) => f.check_area === "offer_vs_bom" && f.title.toLowerCase().includes("plafondarmatuur"),
    );

    expect(armaturen).toBeDefined();
    expect(armaturen!.finding_type).toBe("attention");
    expect(armaturen!.description).toContain("niet uit de documenten af te leiden");
  });

  it("verwijst naar de stuklijstregel als tweede bron", () => {
    const bom = bomDoc("dddddddd-dddd-4ddd-8ddd-dddddddddddd", [
      { number: "1003", description: "Plafondarmatuur met sensor", total: 6 },
    ]);
    const findings = analyseDocuments([offerte, bom]);
    const armaturen = findings.find(
      (f) => f.check_area === "offer_vs_bom" && f.title.toLowerCase().includes("plafondarmatuur"),
    )!;

    expect(armaturen.compared_document_index).toBe(2);
    expect(armaturen.compared_quote).toContain("1003");
  });

  it("meldt een onderdeel dat helemaal niet in de stuklijst voorkomt", () => {
    const bom = bomDoc("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", [
      { number: "1001", description: "Tafel 2400mm", total: 2 },
    ]);
    const findings = analyseDocuments([offerte, bom]);
    const led = findings.find(
      (f) => f.check_area === "offer_vs_bom" && f.title.includes("LED-strip"),
    );

    expect(led).toBeDefined();
    expect(led!.finding_type).toBe("missing");
  });
});

// --- Test G en H -----------------------------------------------------------

describe("Test G: korte regels blijven citeerbaar", () => {
  it("vult een kort citaat aan tot het terugvindbaar is", () => {
    const kort = doc("ffffffff-ffff-4fff-8fff-ffffffffffff", "stuklijst.pdf", "drawing", [
      ["Stuklijst", "2 tafels", "6 banken"].join("\n"),
    ]);
    const tally = tallyDocument(kort, 1);

    expect(tally.mentions.get("tafel")!.quote.length).toBeGreaterThanOrEqual(12);
  });

  it("laat een bevinding met een kort onderdeelregel door de bronverificatie", () => {
    const offer = doc("11111111-1111-4111-8111-111111111111", "offerte.pdf", "offer", [
      ["Offerte", "2 tafels", "6 WCD's in de schaftruimte"].join("\n"),
    ]);
    const drawing = doc("22222222-2222-4222-8222-222222222222", "tekening.pdf", "drawing", [
      ["Plattegrond", "3 tafels", "6 WCD's in de schaftruimte"].join("\n"),
    ]);

    const documents = [offer, drawing];
    const { accepted, rejected } = verifyFindings(analyseDocuments(documents), documents);

    expect(rejected).toHaveLength(0);
    expect(accepted.some((f) => f.title.toLowerCase().includes("tafel"))).toBe(true);
  });
});

describe("Test H: geen dubbele melding vanuit beide richtingen", () => {
  it("meldt hetzelfde verschil één keer", () => {
    const bomAlsPdf = doc("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "stuklijst.pdf", "bill_of_materials", [
      ["Stuklijst", "8 plafondarmaturen"].join("\n"),
    ]);
    const afwijkingen = analyseDocuments([tekening, bomAlsPdf]).filter(
      (f) => f.finding_type === "discrepancy" && f.title.includes("plafondarmaturen"),
    );

    expect(afwijkingen).toHaveLength(1);
  });

  it("meldt omgekeerd nog wel wat de stuklijst noemt en de tekening niet", () => {
    const bomAlsPdf = doc("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "stuklijst.pdf", "bill_of_materials", [
      ["Stuklijst", "3 plafondarmaturen", "4 deuren"].join("\n"),
    ]);
    const deuren = analyseDocuments([tekening, bomAlsPdf]).find((f) => f.title.includes("deur"));

    expect(deuren).toBeDefined();
    expect(deuren!.finding_type).toBe("missing");
    expect(deuren!.source_document_index).toBe(2);
  });
});

// --- Controle 5 en voorzichtigheid -----------------------------------------

describe("Controle 5: locatie-aanduidingen", () => {
  it("meldt een onderdeel zonder locatie-aanduiding", () => {
    const zonderLocatie = doc("ffffffff-ffff-4fff-8fff-ffffffffffff", "offerte.pdf", "offer", [
      ["Offerte", "1 LED-strip"].join("\n"),
    ]);
    const locatie = analyseDocuments([zonderLocatie]).find((f) => f.check_area === "location");

    expect(locatie).toBeDefined();
    expect(locatie!.title).toContain("locatie");
  });

  it("meldt niets wanneer er wel een ruimte bij staat", () => {
    const metLocatie = doc("99999999-9999-4999-8999-999999999999", "offerte.pdf", "offer", [
      ["Offerte", "1 LED-strip schaftruimte"].join("\n"),
    ]);

    expect(
      analyseDocuments([metLocatie]).filter(
        (f) => f.check_area === "location" && f.title.includes("LED-strip"),
      ),
    ).toHaveLength(0);
  });
});

describe("voorzichtigheid van de analyse", () => {
  it("vergelijkt niets wanneer er maar één rol aanwezig is", () => {
    const alleen = analyseDocuments([offerte]);

    expect(alleen.every((f) => f.check_area !== "offer_vs_drawing")).toBe(true);
    expect(alleen.every((f) => f.check_area !== "offer_vs_bom")).toBe(true);
  });

  it("negeert documenten zonder aangegeven rol", () => {
    const zonderRol = doc("77777777-7777-4777-8777-777777777777", "onbekend.pdf", "unknown", [
      "3 plafondarmaturen",
    ]);

    expect(
      analyseDocuments([offerte, zonderRol]).every((f) => f.check_area !== "offer_vs_drawing"),
    ).toBe(true);
  });

  it("levert niets op zonder documenten", () => {
    expect(analyseDocuments([])).toEqual([]);
  });

  it("laat elke constatering door de bronverificatie komen", () => {
    const documents = [offerte, tekening];
    const { accepted, rejected } = verifyFindings(analyseDocuments(documents), documents);

    expect(rejected).toHaveLength(0);
    expect(accepted.length).toBeGreaterThan(0);
    for (const f of accepted) {
      expect(f.source_reference).toMatch(/^Pagina \d+$/);
      expect(documents.some((d) => d.id === f.source_document_id)).toBe(true);
    }
  });

  it("gebruikt uitsluitend citaten die letterlijk in de documenten staan", () => {
    const documents = [offerte, tekening];

    for (const f of analyseDocuments(documents)) {
      const bron = documents[f.source_document_index - 1];
      expect(bron.pages.join("\n")).toContain(f.source_quote);

      if (f.compared_document_index !== null && f.compared_quote) {
        const tweede = documents[f.compared_document_index - 1];
        expect(tweede.pages.join("\n")).toContain(f.compared_quote);
      }
    }
  });

  it("is deterministisch", () => {
    expect(analyseDocuments([offerte, tekening])).toEqual(analyseDocuments([offerte, tekening]));
  });
});
