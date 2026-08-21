import { describe, expect, it } from "vitest";

import { describeError } from "./run-check";

describe("describeError", () => {
  it("wijst een afgekeurde sleutel aan als oorzaak, zonder provider aan te nemen", () => {
    const message = describeError(new Error("401 Incorrect API key provided"));

    expect(message).toContain("API-sleutel");
    expect(message).toContain("provider");
  });

  it("herkent een te druk bezette API", () => {
    expect(describeError(new Error("429 Rate limit reached"))).toContain("drukte");
  });

  it("herkent een leeg tegoed", () => {
    expect(describeError(new Error("insufficient_quota"))).toContain("tegoed");
  });

  it("herkent een netwerkstoring", () => {
    expect(describeError(new Error("fetch failed"))).toContain("verbinding");
  });

  it("noemt het ingestelde model bij een onbekend model", () => {
    const message = describeError(new Error("The model gpt-onbekend does not exist"));

    expect(message).toContain("OPENAI_MODEL");
  });

  it("geeft een onbekende fout netjes terug in plaats van te crashen", () => {
    expect(describeError("zomaar een string")).toContain("onbekends");
    expect(describeError(null)).toContain("onbekends");
  });

  it("laat een gewone foutmelding intact", () => {
    expect(describeError(new Error("Project niet gevonden."))).toBe("Project niet gevonden.");
  });
});
