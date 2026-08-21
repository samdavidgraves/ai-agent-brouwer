import type { RawAiFinding } from "@/features/ai/schema";
import type { AnalysisDocument } from "@/features/ai/verify-findings";

/** Wat een provider nodig heeft om een controle uit te voeren. */
export type AnalysisRequest = {
  /** De instructies uit het controleprofiel. */
  systemPrompt: string;
  /** De opgebouwde documenttekst met document- en paginanummers. */
  input: string;
  /** Dezelfde documenten, gestructureerd, voor providers die daar iets mee kunnen. */
  documents: AnalysisDocument[];
};

/**
 * Ruwe bevindingen, nog niet gecontroleerd. Verificatie van de bron gebeurt
 * altijd in de applicatie (verify-findings.ts), nooit in de provider. Zo geldt
 * dezelfde bewijslast voor elke provider.
 */
export type AnalysisResult = {
  findings: RawAiFinding[];
};

/**
 * Eén analysebron. Implementaties: MockAiProvider (geen externe API) en
 * OpenAiProvider. Later bijvoorbeeld Claude of een lokaal model, zonder dat de
 * database, UI of controle-engine hoeft te veranderen.
 */
export interface AiProvider {
  /** Stabiele identificatie, bijvoorbeeld "mock" of "openai". */
  readonly id: string;
  /** Modelaanduiding die in ai_checks.model wordt vastgelegd. */
  readonly model: string;
  /** Naam voor in de interface. */
  readonly label: string;
  /** Of deze provider een betaalde externe API aanroept. */
  readonly usesPaidApi: boolean;

  analyzeWorkPreparation(request: AnalysisRequest): Promise<AnalysisResult>;
}
