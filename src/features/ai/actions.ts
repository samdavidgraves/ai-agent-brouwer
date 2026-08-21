"use server";

import { revalidatePath } from "next/cache";

import { prepareAnalysis } from "@/features/ai/prepare-analysis";
import { emptyPrepareState, type PrepareState } from "@/features/ai/prepare-state";
import { runAiCheck } from "@/features/ai/run-check";
import { requireSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { FINDING_STATUSES, type FindingStatus } from "@/types/database";

export type AiCheckState = { error: string | null; message: string | null };

/** Hoeveel van de opgebouwde invoer we tonen. Genoeg om te beoordelen, niet zoveel
 *  dat de pagina onleesbaar wordt. */
const PREVIEW_CHARS = 4000;

/**
 * Leest de PDF's, koppelt tekst aan document en pagina en bouwt de controle-invoer
 * op — zonder enige analyse. Zo is vooraf te zien wat er straks beoordeeld wordt.
 */
export async function prepareAnalysisAction(
  _previousState: PrepareState,
  formData: FormData,
): Promise<PrepareState> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!isUuid(projectId)) return { ...emptyPrepareState, error: "Ongeldig project." };

  try {
    const result = await prepareAnalysis(projectId);
    if (!result.ok) return { ...emptyPrepareState, error: result.message };

    const { overview, problems, input } = result.prepared;
    return {
      error: null,
      overview,
      problems,
      inputPreview: input.slice(0, PREVIEW_CHARS),
      inputLength: input.length,
    };
  } catch (error) {
    return {
      ...emptyPrepareState,
      error: error instanceof Error ? error.message : "Voorbereiden mislukt.",
    };
  }
}

export async function startAiCheck(
  _previousState: AiCheckState,
  formData: FormData,
): Promise<AiCheckState> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!isUuid(projectId)) return { error: "Ongeldig project.", message: null };

  let result;
  try {
    result = await runAiCheck(projectId);
  } catch (error) {
    // Vangnet: runAiCheck vangt zelf af, maar een fout in de opzet (bijvoorbeeld
    // ontbrekende Supabase-configuratie) mag de pagina niet laten crashen.
    return {
      error: error instanceof Error ? error.message : "De controle kon niet worden gestart.",
      message: null,
    };
  }

  revalidatePath(`/projecten/${projectId}`);
  revalidatePath("/");

  if (!result.ok) return { error: result.message, message: null };

  const parts = [
    result.findingCount === 1
      ? "1 bevinding gevonden"
      : `${result.findingCount} bevindingen gevonden`,
  ];
  if (result.rejectedCount > 0) {
    parts.push(
      `${result.rejectedCount} ${result.rejectedCount === 1 ? "bevinding is" : "bevindingen zijn"} verworpen omdat de bron niet controleerbaar was`,
    );
  }

  return {
    error: null,
    message: `Controle afgerond via ${result.providerLabel}: ${parts.join(", ")}.`,
  };
}

export async function updateFindingStatus(formData: FormData): Promise<void> {
  const findingId = String(formData.get("finding_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!isUuid(findingId) || !isUuid(projectId)) throw new Error("Ongeldige bevinding.");
  if (!FINDING_STATUSES.includes(status as FindingStatus)) {
    throw new Error(`Onbekende beoordeling: ${status}`);
  }

  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from("ai_findings")
    .update({
      status,
      reviewed_at: status === "open" ? null : new Date().toISOString(),
    })
    .eq("id", findingId);

  if (error) throw new Error(error.message);

  revalidatePath(`/projecten/${projectId}`);
}
