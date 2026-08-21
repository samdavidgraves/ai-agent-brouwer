import { analyseDocuments } from "./mock-analysis";
import type { AiProvider, AnalysisRequest, AnalysisResult } from "./types";

/**
 * Testprovider zonder externe API.
 *
 * Bootst de vijf controles van het Brouwer-profiel na met eenvoudige,
 * deterministische patroonherkenning (zie mock-analysis.ts). Dezelfde documenten
 * geven altijd hetzelfde resultaat.
 *
 * Twee dingen om te onthouden:
 *
 * 1. Dit is geen AI. Het herkent alleen woorden en getallen die letterlijk in de
 *    documenten staan. Het mist dus veel wat een echte analyse wel zou zien, en
 *    het begrijpt geen tekeningen.
 * 2. Er wordt nooit aangenomen wat een correcte waarde hoort te zijn. Elke
 *    constatering rust op een letterlijke regel uit een aangeleverd document, en
 *    gaat daarna nog langs de bronverificatie in verify-findings.ts.
 */
export class MockAiProvider implements AiProvider {
  readonly id = "mock";
  readonly model = "mock-v2";
  readonly label = "Testprovider (geen externe API)";
  readonly usesPaidApi = false;

  async analyzeWorkPreparation({ documents }: AnalysisRequest): Promise<AnalysisResult> {
    return { findings: analyseDocuments(documents) };
  }
}
