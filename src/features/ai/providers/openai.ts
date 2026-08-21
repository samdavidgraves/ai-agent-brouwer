import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { aiResponseSchema, parseAiResponse } from "@/features/ai/schema";
import type { AiProvider, AnalysisRequest, AnalysisResult } from "./types";

/** Geverifieerd beschikbaar: gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna. Terra biedt
 *  de beste verhouding tussen betrouwbaarheid en kosten voor documentanalyse. */
export const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

/**
 * Analyse via de OpenAI Responses API met verplicht JSON-schema (strict mode).
 *
 * Wordt alleen aangemaakt wanneer AI_PROVIDER=openai én er een sleutel is; zonder
 * die keuze roept de applicatie nooit een betaalde API aan.
 */
export class OpenAiProvider implements AiProvider {
  readonly id = "openai";
  readonly label = "OpenAI";
  readonly usesPaidApi = true;
  readonly model: string;

  private client: OpenAI;

  constructor(apiKey: string, model = getOpenAiModel()) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyzeWorkPreparation({
    systemPrompt,
    input,
  }: AnalysisRequest): Promise<AnalysisResult> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ],
      text: { format: zodTextFormat(aiResponseSchema, "werkvoorbereiding_controle") },
    });

    if (!response.output_parsed) {
      throw new Error("Het model gaf geen bruikbaar antwoord terug.");
    }

    const validated = parseAiResponse(response.output_parsed);
    if (!validated.ok) throw new Error(validated.message);

    return { findings: validated.response.findings };
  }
}
