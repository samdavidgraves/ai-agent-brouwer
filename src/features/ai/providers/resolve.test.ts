import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describeActiveProvider, getConfiguredProviderId, resolveProvider } from "./index";

const original = { ...process.env };

beforeEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
});

afterEach(() => {
  process.env = { ...original };
});

describe("providerkeuze", () => {
  it("gebruikt zonder configuratie de testprovider", () => {
    expect(getConfiguredProviderId()).toBe("mock");

    const resolution = resolveProvider();
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.provider.id).toBe("mock");
      expect(resolution.provider.usesPaidApi).toBe(false);
    }
  });

  it("heeft geen OPENAI_API_KEY nodig om te werken", () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(resolveProvider().ok).toBe(true);
  });

  it("negeert een aanwezige sleutel zolang AI_PROVIDER niet op openai staat", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const resolution = resolveProvider();
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.provider.id).toBe("mock");
  });

  it("kiest OpenAI alleen bij een expliciete keuze mét sleutel", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-5.6-terra";

    const resolution = resolveProvider();
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.provider.id).toBe("openai");
      expect(resolution.provider.model).toBe("gpt-5.6-terra");
      expect(resolution.provider.usesPaidApi).toBe(true);
    }
  });

  it("legt uit wat er mis is als openai is gekozen zonder sleutel", () => {
    process.env.AI_PROVIDER = "openai";

    const resolution = resolveProvider();
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.message).toContain("OPENAI_API_KEY");
      expect(resolution.message).toContain("testprovider");
    }
  });
});

describe("describeActiveProvider", () => {
  it("meldt dat de testprovider niets kost", () => {
    expect(describeActiveProvider()).toEqual({
      label: "Testprovider (geen externe API)",
      usesPaidApi: false,
    });
  });

  it("noemt het model wanneer OpenAI actief is", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";

    const described = describeActiveProvider();
    expect(described.usesPaidApi).toBe(true);
    expect(described.label).toContain("gpt-5.6-terra");
  });
});
