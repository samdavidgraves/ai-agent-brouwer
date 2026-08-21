import "server-only";

import { STALE_CHECK_AFTER_MS } from "@/features/ai/limits";
import { prepareAnalysis } from "@/features/ai/prepare-analysis";
import { ACTIVE_PROFILE } from "@/features/ai/prompts";
import { getOpenAiModel, resolveProvider } from "@/features/ai/providers";
import { verifyFindings } from "@/features/ai/verify-findings";
import { requireSupabaseClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/types/database";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export type RunCheckResult =
  | {
      ok: true;
      checkId: string;
      findingCount: number;
      rejectedCount: number;
      providerLabel: string;
    }
  | { ok: false; message: string };

/** Zet een technische fout om in iets dat een werkvoorbereider begrijpt. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "Er ging iets onbekends mis tijdens de controle.";

  const message = error.message;
  if (/api key|unauthorized|401/i.test(message)) {
    return "De API-sleutel van de gekozen provider wordt niet geaccepteerd.";
  }
  if (/rate limit|429/i.test(message)) {
    return "De provider liet dit verzoek nu niet toe wegens drukte. Probeer het over een minuut opnieuw.";
  }
  if (/quota|insufficient_quota|billing/i.test(message)) {
    return "Het account van de provider heeft geen tegoed meer. Controleer de facturering.";
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    return "Geen verbinding met de provider. Controleer de internetverbinding en probeer het opnieuw.";
  }
  if (/model|does not exist|not found/i.test(message) && /gpt/i.test(message)) {
    return `Het ingestelde model (${getOpenAiModel()}) is niet beschikbaar voor dit account. Pas OPENAI_MODEL aan.`;
  }
  return message;
}

/**
 * Voert de volledige controle uit: PDF's lezen, invoer opbouwen, laten analyseren
 * door de actieve provider, bevindingen op bron verifiëren en opslaan.
 *
 * Loopt er iets mis, dan komt de ai_check op 'failed' met de fout erbij en gaat de
 * projectstatus terug naar wat hij was. De projectstatus wordt nooit op 'completed'
 * gezet door een mislukte controle.
 */
export async function runAiCheck(projectId: string): Promise<RunCheckResult> {
  const supabase = requireSupabaseClient();

  // 1. Provider bepalen vóór we iets in de database aanpassen.
  const resolution = resolveProvider();
  if (!resolution.ok) return { ok: false, message: resolution.message };
  const provider = resolution.provider;

  // 2. Documenten lezen en invoer opbouwen. Faalt dit, dan is er nog geen
  //    controle geregistreerd en hoeft er niets teruggedraaid te worden.
  const preparation = await prepareAnalysis(projectId);
  if (!preparation.ok) return { ok: false, message: preparation.message };
  const { documents, input, project, unsupported, sourceId } = preparation.prepared;
  const previousStatus: ProjectStatus = project.status;

  // 3. Vastgelopen controle van een gecrasht proces vrijgeven.
  const { data: active } = await supabase
    .from("ai_checks")
    .select("id, created_at")
    .eq("project_id", projectId)
    .in("status", ["pending", "processing"])
    .maybeSingle();

  if (active) {
    const age = Date.now() - new Date(active.created_at as string).getTime();
    if (age < STALE_CHECK_AFTER_MS) {
      return { ok: false, message: "Er loopt al een controle voor dit project." };
    }
    await supabase
      .from("ai_checks")
      .update({ status: "failed", error: "Controle afgebroken: proces is vastgelopen." })
      .eq("id", active.id);
  }

  // 4. Controle registreren. Een gelijktijdige tweede poging botst hier op de
  //    unique index en krijgt een nette melding.
  const { data: check, error: insertError } = await supabase
    .from("ai_checks")
    .insert({
      project_id: projectId,
      status: "processing",
      model: provider.model,
      prompt_version: ACTIVE_PROFILE.version,
      profile_label: ACTIVE_PROFILE.label,
      documents_analyzed: documents.length,
      documents_unsupported: unsupported.length,
      source_id: sourceId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
      return { ok: false, message: "Er loopt al een controle voor dit project." };
    }
    return { ok: false, message: insertError.message };
  }

  const checkId = check.id as string;
  const startedAt = Date.now();

  async function fail(message: string): Promise<RunCheckResult> {
    await supabase
      .from("ai_checks")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", checkId);
    await supabase.from("projects").update({ status: previousStatus }).eq("id", projectId);
    return { ok: false, message };
  }

  try {
    await supabase.from("projects").update({ status: "checking" }).eq("id", projectId);

    // 5. Analyse door de actieve provider.
    const result = await provider.analyzeWorkPreparation({
      systemPrompt: ACTIVE_PROFILE.systemPrompt,
      input,
      documents,
    });

    // 6. Elke bevinding tegen de echte documenttekst controleren. Dit gebeurt
    //    hier, niet in de provider: dezelfde bewijslast voor elke bron.
    const { accepted, rejected } = verifyFindings(result.findings, documents);

    if (accepted.length > 0) {
      const { error: findingsError } = await supabase
        .from("ai_findings")
        .insert(accepted.map((finding) => ({ ...finding, ai_check_id: checkId })));
      if (findingsError) return await fail(findingsError.message);
    }

    // 7. Afronden met de meetgegevens voor de pilot. Het project gaat naar
    //    'ready_for_check': de werkvoorbereider moet de bevindingen nog
    //    beoordelen, dus 'completed' is te vroeg.
    await supabase
      .from("ai_checks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        findings_rejected: rejected.length,
        error: null,
      })
      .eq("id", checkId);
    await supabase.from("projects").update({ status: "ready_for_check" }).eq("id", projectId);

    return {
      ok: true,
      checkId,
      findingCount: accepted.length,
      rejectedCount: rejected.length,
      providerLabel: provider.label,
    };
  } catch (error) {
    return await fail(describeError(error));
  }
}
