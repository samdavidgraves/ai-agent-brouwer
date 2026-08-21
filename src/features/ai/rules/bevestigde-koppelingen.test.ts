import { describe, expect, it } from "vitest";

import { analyseDocuments, extractCount, extractSizeMm, isExcluded } from "@/features/ai/providers/mock-analysis";
import {
  ARTICLE_LINKS,
  findArticleLink,
  findItem,
  isStandardItem,
  normaliseOcrLetters,
  STANDARD_ITEMS,
} from "./brouwer-rules";
import type { BomArticle } from "@/features/documents/parsers";
import type { AnalysisDocument } from "@/features/ai/verify-findings";

/**
 * Regressietests bij de inhoudelijke beslissingen die de werkvoorbereider na de
 * validatie van P251411 heeft bevestigd. Elke test legt één beslissing vast, zodat
 * een latere wijziging in de regels zichtbaar wordt in plaats van stil door te
 * sijpelen in de constateringen.
 */

/** Stuklijst zoals de xlsx-parser hem oplevert. */
function bom(
  articles: { number: string; description: string; perUnit: number }[],
  subprojectCount = 100,
): AnalysisDocument {
  const parsed: BomArticle[] = articles.map((a) => ({
    articleNumber: a.number,
    description: a.description,
    unit: "Stuks",
    totalAmount: a.perUnit * subprojectCount,
    perSubproject: new Map(),
    rowCount: subprojectCount,
  }));

  return {
    id: "bom",
    fileName: "stuklijst.xlsx",
    role: "bill_of_materials",
    pages: [
      ["Stuklijst stuklijst.xlsx", ""]
        .concat(
          parsed.map(
            (a) =>
              `${a.articleNumber} | ${a.description} | ${a.totalAmount} Stuks (${a.totalAmount / subprojectCount} per subproject)`,
          ),
        )
        .join("\n"),
    ],
    articles: parsed,
    subprojectCount,
  };
}

function offerte(...regels: string[]): AnalysisDocument {
  return {
    id: "offer",
    fileName: "offerte.pdf",
    role: "offer",
    pages: [["Offerte", ...regels].join("\n")],
  };
}

function tekening(...regels: string[]): AnalysisDocument {
  return {
    id: "drawing",
    fileName: "vk01.pdf",
    role: "drawing",
    pages: [["Verkooptekening", ...regels].join("\n")],
  };
}

// ---------------------------------------------------------------------------
// Tafel: het tafelblad is de functionele teller
// ---------------------------------------------------------------------------

const tafelStuklijst = bom([
  { number: "11800291", description: "Tafelblad 2400 x 550 mm met ronde hoeken licht bruin beton triplex 18mm", perUnit: 1 },
  { number: "11890042", description: "Tafelpootvoet t.b.v. schafttafel met dubbele poot", perUnit: 2 },
]);

describe("tafel: 11800291 is de functionele teller", () => {
  it("legt het tafelblad vast als teller en de pootvoet als ondersteunend", () => {
    const link = findArticleLink("tafel")!;
    expect(link.articleNumbers).toEqual(["11800291"]);
    expect(link.supportingArticles?.map((a) => a.articleNumber)).toEqual(["11890042"]);
  });

  it("vergelijkt met het tafelblad en niet met de pootvoeten", () => {
    // De pootvoet staat met 2 per unit in de stuklijst en zou zonder deze
    // modellering de teller worden; dan zou 1 tafel tegenover 2 komen te staan.
    const findings = analyseDocuments([offerte("Tafel 1x 2400mm in schaftruimte"), tafelStuklijst]);
    expect(findings.filter((f) => f.title.toLowerCase().includes("tafel"))).toEqual([]);
  });

  it("meldt wel een verschil zodra het tafelblad afwijkt", () => {
    const findings = analyseDocuments([offerte("Tafel 3x 2400mm in schaftruimte"), tafelStuklijst]);
    const tafel = findings.find((f) => f.title.includes("tafels"))!;

    expect(tafel).toBeDefined();
    expect(tafel.compared_quote).toContain("11800291");
    expect(tafel.compared_quote).not.toContain("Tafelpootvoet");
    expect(tafel.description).toContain("11890042");
  });
});

// ---------------------------------------------------------------------------
// WCD: vijf functionele dubbele WCD's, niet tien inbouwdelen
// ---------------------------------------------------------------------------

const wcdStuklijst = bom([
  { number: "12620094", description: "WCD 1-voudig + randaarde inbouw, RAL 9010, PEHA 792021", perUnit: 10 },
  { number: "12620096", description: "Opbouwhuis 2-voudig, RAL 9010. PEHA 199611", perUnit: 5 },
  { number: "12620093", description: "Afdekraam 2-voudig, RAL 9010 polar wit", perUnit: 5 },
]);

describe("WCD: het opbouwhuis 2-voudig telt de dubbele WCD's", () => {
  it("legt 12620096 vast als teller en de andere twee als ondersteunend", () => {
    const link = findArticleLink("wcd")!;
    expect(link.articleNumbers).toEqual(["12620096"]);
    expect(link.supportingArticles?.map((a) => a.articleNumber).sort()).toEqual([
      "12620093",
      "12620094",
    ]);
  });

  it("vergelijkt vijf uit de offerte met vijf dubbele WCD's, niet met tien", () => {
    // Zonder deze modellering won 12620094 met 10 per unit en ontstond er een
    // verschil van 5 tegenover 10 waar er in werkelijkheid geen verschil is.
    const findings = analyseDocuments([
      offerte("- 5 stuks Extra wandcontactdoos, dubbelvoudig"),
      wcdStuklijst,
    ]);

    expect(findings.filter((f) => f.title.includes("WCD"))).toEqual([]);
  });

  it("meldt een verschil pas wanneer het aantal dubbele WCD's afwijkt", () => {
    const findings = analyseDocuments([
      offerte("- 7 stuks Extra wandcontactdoos, dubbelvoudig"),
      wcdStuklijst,
    ]);
    const wcd = findings.find((f) => f.title.includes("WCD"))!;

    expect(wcd).toBeDefined();
    expect(wcd.compared_quote).toContain("12620096");
    // WCD blijft een standaardonderdeel en de offerteregel gaat over meerwerk,
    // dus dit mag geen harde afwijking worden.
    expect(wcd.finding_type).toBe("attention");
  });
});

// ---------------------------------------------------------------------------
// Bank: maatafhankelijke omrekening, geen vaste verhouding
// ---------------------------------------------------------------------------

const bankStuklijst = (perUnit: number) =>
  bom([
    {
      number: "11810018",
      description:
        "Opbergbank met rugleuning 1200mm (breedte bank) x 515mm (diepte opbergbank) lichtbruine betonplex",
      perUnit,
    },
    { number: "11440055-S", description: "Bankdeksel 1200mm bekleden met skai diepte: 44 cm", perUnit },
  ]);

describe("bank: het aantal artikelen volgt uit de maat", () => {
  it("legt geen vaste verhouding vast maar twee maten", () => {
    const link = findArticleLink("bank")!;
    expect(link.sizeConversions).toEqual([
      { sizeMm: 1200, articlesPerItem: 1 },
      { sizeMm: 2400, articlesPerItem: 2 },
    ]);
  });

  it("leest de maat uit beide schrijfwijzen die in P251411 voorkomen", () => {
    const bank = findItem("bank")!;
    expect(extractSizeMm("Tafel en banken 2400mm", bank)).toBe(2400);
    // "(2x1200)" is een samenstelling: twee modules van 1200 mm vormen samen een
    // bank van 2400 mm. De maat van de bank is dus 2400, niet 1200.
    expect(extractSizeMm("1140+vl Tafel 2400 + bank (2x1200)", bank)).toBe(2400);
    expect(extractSizeMm("Bank met rugleuning", bank)).toBeNull();
  });

  it("leest (2x1200) niet als twee banken", () => {
    // Bevestigd door Brouwer: dit is een productieverduidelijking, geen telling.
    const bank = findItem("bank")!;
    expect(extractCount("1140+vl Tafel 2400 + bank (2x1200)", bank)).toBeNull();
    // Een losse "(2x)" zonder maat erachter blijft wel gewoon een aantal.
    expect(extractCount("Legplank (2x) boven de wasbak", findItem("legplank")!)).toBe(2);
  });

  it("bank van 1200 mm telt als één module", () => {
    // "2x bank 1200mm" is wel een telling: twee losse banken van 1200 mm.
    const geen = analyseDocuments([tekening("2x Bank 1200mm langs wand A"), bankStuklijst(2)]);
    expect(geen.filter((f) => f.title.toLowerCase().includes("bank"))).toEqual([]);

    const wel = analyseDocuments([tekening("2x Bank 1200mm langs wand A"), bankStuklijst(4)]);
    const bank = wel.find((f) => f.title.toLowerCase().includes("bank"))!;
    expect(bank).toBeDefined();
    expect(bank.description).toContain("2 x 1200 mm = 2 stuks");
  });

  it("Tafel 2400 + bank (2x1200) is één bank van 2400 mm, dus 2 modules", () => {
    const regel = "1140+vl Tafel 2400 + bank (2x1200)";

    // Eén bankopstelling van 2400 mm hoort bij 2 x artikel 11810018.
    const geen = analyseDocuments([tekening(regel), bankStuklijst(2)]);
    expect(geen.filter((f) => f.title.toLowerCase().includes("bank"))).toEqual([]);

    const wel = analyseDocuments([tekening(regel), bankStuklijst(3)]);
    const bank = wel.find((f) => f.title.toLowerCase().includes("bank"))!;
    expect(bank.description).toContain("1 x 2400 mm = 2 stuks");
  });

  it("twee van zulke bankopstellingen zijn samen 4 modules", () => {
    // De tekeningregels zoals ze in P251411 staan: twee fysieke banken van
    // 2400 mm, plus een regel zonder maat. Samen 2 + 2 = 4 modules, en dat is
    // precies wat de stuklijst bevat. Hier hoort dus niets uit te komen; eerder
    // leverde dit een onterechte afwijking van 2 tegenover 4 op.
    const zoalsInDossier = tekening(
      "1140+vl Tafel 2400 + bank (2x1200)",
      "Bank met rugleuning",
      "Tafel+ bank 2400mm",
    );

    expect(
      analyseDocuments([zoalsInDossier, bankStuklijst(4)]).filter((f) =>
        f.title.toLowerCase().includes("bank"),
      ),
    ).toEqual([]);

    const wel = analyseDocuments([zoalsInDossier, bankStuklijst(6)]);
    const bank = wel.find((f) => f.title.toLowerCase().includes("bank"))!;
    expect(bank.description).toContain("samen 4 x artikel 11810018");
    // Eén regel noemt de bank zonder maat, dus het aantal is een ondergrens.
    // Een verschil mag dan geen harde afwijking worden.
    expect(bank.finding_type).toBe("attention");
    expect(bank.description).toContain("ondergrens");
  });

  it("levert wel een harde afwijking als elke bankregel een maat heeft", () => {
    const twee = tekening("1140+vl Tafel 2400 + bank (2x1200)", "Tafel+ bank 2400mm");
    const bank = analyseDocuments([twee, bankStuklijst(6)]).find((f) =>
      f.title.toLowerCase().includes("bank"),
    )!;

    expect(bank.finding_type).toBe("discrepancy");
    expect(bank.description).toContain("samen 4 x artikel 11810018");
  });

  it("bank van 2400 mm telt als twee modules", () => {
    // 2 banken van 2400 mm op één regel = 4 modules.
    const geen = analyseDocuments([offerte("Tafel en 2 banken 2400mm"), bankStuklijst(4)]);
    expect(geen.filter((f) => f.title.toLowerCase().includes("bank"))).toEqual([]);

    const wel = analyseDocuments([offerte("Tafel en 2 banken 2400mm"), bankStuklijst(2)]);
    const bank = wel.find((f) => f.title.toLowerCase().includes("bank"))!;
    expect(bank).toBeDefined();
    expect(bank.description).toContain("2 x 2400 mm = 4 stuks");
  });

  it("vergelijkt niet wanneer de maat ontbreekt", () => {
    const findings = analyseDocuments([tekening("2x Bank met rugleuning"), bankStuklijst(4)]);
    const bank = findings.find((f) => f.title.toLowerCase().includes("bank"))!;

    expect(bank.finding_type).toBe("attention");
    expect(bank.title).toContain("maat ontbreekt");
  });

  it("leidt geen aantal af uit een maat die niet is vastgelegd", () => {
    const findings = analyseDocuments([tekening("2x Bank 1800mm langs wand A"), bankStuklijst(4)]);
    const bank = findings.find((f) => f.title.toLowerCase().includes("bank"))!;

    expect(bank.finding_type).toBe("attention");
    expect(bank.title).toContain("1800 mm is niet vastgelegd");
  });
});

// ---------------------------------------------------------------------------
// Raam: geen standaardonderdeel meer, dus een afwijking is mogelijk
// ---------------------------------------------------------------------------

const raamStuklijst = bom([
  { number: "12620093", description: "Afdekraam 2-voudig, RAL 9010 polar wit", perUnit: 5 },
  {
    number: "11630145-S",
    description: "Kunststof schuifraam BZ, wanddikte 43mm, dubbel glas met rolluik + ventilatie",
    perUnit: 2,
  },
]);

describe("raam: geen standaardonderdeel", () => {
  it("staat niet meer in STANDARD_ITEMS", () => {
    expect(isStandardItem("raam")).toBe(false);
    expect(STANDARD_ITEMS).toEqual(["wcd", "lichtschakelaar", "plafondarmatuur", "deur"]);
  });

  it("levert nu een echte afwijking op bij een afwijkend aantal", () => {
    const findings = analyseDocuments([
      offerte("Raam : 3x Kunststofschuifraam met veiligheidsglas en rolluik"),
      raamStuklijst,
    ]);
    const raam = findings.find((f) => f.title.includes("ramen"))!;

    expect(raam).toBeDefined();
    expect(raam.finding_type).toBe("discrepancy");
    expect(raam.compared_quote).toContain("11630145-S");
    expect(raam.compared_quote).not.toContain("Afdekraam");
  });

  it("meldt niets wanneer offerte en stuklijst gelijk zijn", () => {
    const findings = analyseDocuments([
      offerte("Raam : 2x Kunststofschuifraam met veiligheidsglas en rolluik"),
      raamStuklijst,
    ]);
    expect(findings.filter((f) => f.title.includes("ram"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LED-strip: koppeling bevestigd, IP-verschil blijft zichtbaar
// ---------------------------------------------------------------------------

describe("LED-strip: het IP-verschil blijft een aandachtspunt", () => {
  it("houdt profiel en trafo buiten de koppeling", () => {
    const link = findArticleLink("led_strip")!;
    expect(link.articleNumbers).toEqual(["900006878"]);
    expect(link.supportingArticles ?? []).toEqual([]);
  });

  it("meldt het openstaande punt ook als de aantallen kloppen", () => {
    const stuklijst = bom([
      { number: "900006878", description: "LED STRIP 5M 24V 4000K IP20 LEDS 50055062 (YPHIX)", perUnit: 1 },
    ]);
    const findings = analyseDocuments([
      offerte("- Led-strip 24 Volt 4000 Kelvin IP68 in schaftruimte inclusief trafo"),
      stuklijst,
    ]);
    const punt = findings.find((f) => f.title.includes("aandachtspunt blijft open"))!;

    expect(punt).toBeDefined();
    expect(punt.finding_type).toBe("attention");
    expect(punt.description).toContain("IP68");
    expect(punt.description).toContain("IP20");
  });
});

// ---------------------------------------------------------------------------
// OCR: "bu¡tendeur" moet als buitendeur worden herkend
// ---------------------------------------------------------------------------

describe("OCR-variant bu¡tendeur", () => {
  it("normaliseert alleen tekens die visueel een i zijn", () => {
    expect(normaliseOcrLetters("bu¡tendeur")).toBe("buitendeur");
    expect(normaliseOcrLetters("rollu¡k")).toBe("rolluik");
    // Geen brede normalisatie: gewone letters en cijfers blijven ongemoeid.
    expect(normaliseOcrLetters("buitendeur")).toBe("buitendeur");
    expect(normaliseOcrLetters("1200mm | Bank")).toBe("1200mm | Bank");
  });

  it("sluit de secustrip-regel uit ondanks de OCR-fout", () => {
    const deur = findItem("deur")!;
    const regel = "- 2 stuks lnbraakwerende secustrip op de bu¡tendeur (t.b.v. alu kozijn)";

    expect(isExcluded(regel, deur)).toBe(true);
    // Dezelfde regel zonder OCR-fout werd al uitgesloten; dat moet zo blijven.
    expect(isExcluded("- 2 stuks Stormketting op de buitendeur", deur)).toBe(true);
  });

  it("telt de secustrip-regel niet langer als twee deuren", () => {
    const findings = analyseDocuments([
      offerte("- 2 stuks lnbraakwerende secustrip op de bu¡tendeur (t.b.v. alu kozijn)"),
      tekening("Buitenzijde deur RAL 9010"),
    ]);

    expect(findings.filter((f) => f.title.toLowerCase().includes("deur"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Wat er bewust NIET gekoppeld is
// ---------------------------------------------------------------------------

describe("bewust niet gekoppeld", () => {
  it("bevat uitsluitend de vijf bevestigde koppelingen", () => {
    expect(ARTICLE_LINKS.map((l) => l.item).sort()).toEqual([
      "bank",
      "led_strip",
      "raam",
      "tafel",
      "wcd",
    ]);
  });

  it("koppelt deur en legplank niet", () => {
    expect(findArticleLink("deur")).toBeUndefined();
    expect(findArticleLink("legplank")).toBeUndefined();
  });
});
