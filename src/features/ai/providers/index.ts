import { MockAiProvider } from "./mock";
import { getOpenAiModel, isOpenAiConfigured, OpenAiProvider } from "./openai";
import type { AiProvider } from "./types";

export type { AiProvider, AnalysisRequest, AnalysisResult } from "./types";
export { MockAiProvider } from "./mock";
export { OpenAiProvider, getOpenAiModel, isOpenAiConfigured } from "./openai";

export type ProviderId = "mock" | "openai";

/** Zonder expliciete keuze draait de applicatie op de testprovider. Zo kan er
 *  nooit per ongeluk een betaalde API worden aangeroepen. */
export const DEFAULT_PROVIDER: ProviderId = "mock";

export function getConfiguredProviderId(): ProviderId {
  return process.env.AI_PROVIDER?.trim() === "openai" ? "openai" : DEFAULT_PROVIDER;
}

export type ProviderResolution =
  | { ok: true; provider: AiProvider }
  | { ok: false; message: string };

/**
 * Kiest de provider op basis van AI_PROVIDER. Ontbreekt die, dan is het de
 * testprovider: de applicatie werkt volledig zonder OPENAI_API_KEY.
 */
export function resolveProvider(): ProviderResolution {
  if (getConfiguredProviderId() === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        message:
          "AI_PROVIDER staat op 'openai', maar OPENAI_API_KEY ontbreekt. Vul de sleutel in, of haal AI_PROVIDER weg om de testprovider te gebruiken.",
      };
    }
    return { ok: true, provider: new OpenAiProvider(apiKey, getOpenAiModel()) };
  }

  return { ok: true, provider: new MockAiProvider() };
}

/** Beschrijving van de actieve provider voor in de interface. */
export function describeActiveProvider(): { label: string; usesPaidApi: boolean } {
  const id = getConfiguredProviderId();
  if (id === "openai") {
    return {
      label: isOpenAiConfigured() ? `OpenAI (${getOpenAiModel()})` : "OpenAI (sleutel ontbreekt)",
      usesPaidApi: true,
    };
  }
  return { label: "Testprovider (geen externe API)", usesPaidApi: false };
}
