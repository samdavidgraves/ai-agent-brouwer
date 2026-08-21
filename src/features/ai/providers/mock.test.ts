import { describe, expect, it, vi } from "vitest";

import type { AnalysisDocument } from "@/features/ai/verify-findings";
import { MockAiProvider } from "./mock";

const documents: AnalysisDocument[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    fileName: "offerte.pdf",
    role: "offer",
    pages: [["Offerte 2026-0142", "4 plafondarmaturen", "1 LED-strip schaftruimte"].join("\n")],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    fileName: "tekening.pdf",
    role: "drawing",
    pages: [["Plattegrond", "3 plafondarmaturen"].join("\n")],
  },
];

const request = { systemPrompt: "", input: "", documents };

describe("MockAiProvider", () => {
  it("is de testprovider en kost niets", () => {
    const provider = new MockAiProvider();

    expect(provider.id).toBe("mock");
    expect(provider.model).toBe("mock-v2");
    expect(provider.usesPaidApi).toBe(false);
  });

  it("werkt zonder enige API-sleutel", async () => {
    const provider = new MockAiProvider();

    expect(process.env.OPENAI_API_KEY).toBeFalsy();
    await expect(provider.analyzeWorkPreparation(request)).resolves.toBeDefined();
  });

  it("doet geen enkele netwerkaanroep", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await new MockAiProvider().analyzeWorkPreparation(request);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("geeft dezelfde bevindingen bij dezelfde documenten", async () => {
    const provider = new MockAiProvider();
    const eerste = await provider.analyzeWorkPreparation(request);
    const tweede = await provider.analyzeWorkPreparation(request);

    expect(eerste.findings).toEqual(tweede.findings);
  });

  it("voert de vijf controles uit en levert bruikbare constateringen", async () => {
    const { findings } = await new MockAiProvider().analyzeWorkPreparation(request);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.finding_type === "discrepancy")).toBe(true);
    expect(findings.some((f) => f.finding_type === "missing")).toBe(true);
  });

  it("levert een lege lijst bij documenten zonder herkende onderdelen", async () => {
    const leeg = [
      {
        id: "33333333-3333-4333-8333-333333333333",
        fileName: "brief.pdf",
        role: "other" as const,
        pages: ["Geachte heer, hierbij bevestigen wij de afspraak van vorige week."],
      },
    ];

    const { findings } = await new MockAiProvider().analyzeWorkPreparation({
      systemPrompt: "",
      input: "",
      documents: leeg,
    });

    expect(findings).toEqual([]);
  });
});
