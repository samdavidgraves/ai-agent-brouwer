import { describe, expect, it } from "vitest";

import { extractPdfText, joinPages, pageMarker, splitPages } from "./extract-pdf";
import { createTextPdf } from "@/test/pdf-fixture";

describe("extractPdfText", () => {
  it("leest tekst uit een echte PDF, met de juiste pagina-indeling", async () => {
    const pdf = createTextPdf([
      ["Werkomschrijving unit 12", "Aantal units: 4"],
      ["Materiaallijst", "Aantal units: 6"],
    ]);

    const result = await extractPdfText(pdf);

    expect(result.pageCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("Werkomschrijving unit 12");
    expect(result.text).toContain("Materiaallijst");
    expect(result.text).toContain(pageMarker(1));
    expect(result.text).toContain(pageMarker(2));
  });

  it("houdt de tekst van beide pagina's gescheiden", async () => {
    const pdf = createTextPdf([["Eerste pagina"], ["Tweede pagina"]]);

    const result = await extractPdfText(pdf);
    const pages = splitPages(result.text);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Eerste pagina");
    expect(pages[0]).not.toContain("Tweede pagina");
    expect(pages[1]).toContain("Tweede pagina");
  });

  it("kapt af zodra de tekenlimiet is bereikt", async () => {
    const pdf = createTextPdf([["Pagina een met tekst"], ["Pagina twee met tekst"]]);

    const result = await extractPdfText(pdf, 40);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(40);
  });

  it("geeft een leesbare fout bij iets dat geen PDF is", async () => {
    const nonsense = new TextEncoder().encode("dit is gewoon platte tekst");
    await expect(extractPdfText(nonsense)).rejects.toThrow();
  });
});

describe("joinPages", () => {
  it("zet paginamarkeringen voor elke pagina", () => {
    const result = joinPages(["eerste", "tweede", "derde"]);

    expect(result.pageCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("[pagina 1]\neerste\n\n[pagina 2]\ntweede\n\n[pagina 3]\nderde");
  });

  it("meldt afkappen en laat de rest weg", () => {
    const result = joinPages(["kort", "x".repeat(500)], 60);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain("kort");
    expect(result.text.length).toBeLessThanOrEqual(60);
  });

  it("normaliseert overmatige lege regels", () => {
    const result = joinPages(["regel\n\n\n\nvolgende"]);

    expect(result.text).toBe("[pagina 1]\nregel\n\nvolgende");
  });
});

describe("splitPages", () => {
  it("is de omgekeerde bewerking van joinPages", () => {
    const pages = ["eerste stuk tekst", "tweede stuk tekst"];
    const joined = joinPages(pages);

    expect(splitPages(joined.text)).toEqual(pages);
  });

  it("geeft een lege lijst bij tekst zonder markeringen", () => {
    expect(splitPages("zomaar wat tekst")).toEqual([]);
  });
});
