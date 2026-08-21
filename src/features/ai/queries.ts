import { CHECK_AREA_ORDER } from "@/features/ai/labels";
import { isMissingTableError } from "@/lib/supabase/errors";
import { getSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import type { AiCheckWithFindings } from "@/types/database";

export type LatestAiCheck = {
  /** false wanneer migratie 0002 nog niet is uitgevoerd. */
  schemaReady: boolean;
  check: AiCheckWithFindings | null;
};

/** De meest recente AI-controle van een project, inclusief bevindingen. */
export async function getLatestAiCheck(projectId: string): Promise<LatestAiCheck> {
  if (!isUuid(projectId)) return { schemaReady: true, check: null };

  const supabase = getSupabaseClient();
  if (!supabase) return { schemaReady: true, check: null };

  const { data, error } = await supabase
    .from("ai_checks")
    .select("*, ai_findings(*)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Zonder de v0.2-tabellen blijft de rest van de projectpagina gewoon werken.
  if (isMissingTableError(error)) return { schemaReady: false, check: null };
  if (error) throw new Error(error.message);
  if (!data) return { schemaReady: true, check: null };

  const check = data as AiCheckWithFindings;

  // Afwijkingen eerst, dan ontbrekend, dan aandachtspunten; daarbinnen op
  // controlegebied en volgorde van aanmaken.
  const typeWeight = { discrepancy: 0, missing: 1, attention: 2 };
  const areaWeight = Object.fromEntries(
    CHECK_AREA_ORDER.map((area, index) => [area, index]),
  ) as Record<string, number>;

  check.ai_findings.sort(
    (a, b) =>
      typeWeight[a.finding_type] - typeWeight[b.finding_type] ||
      areaWeight[a.check_area] - areaWeight[b.check_area] ||
      a.created_at.localeCompare(b.created_at),
  );

  return { schemaReady: true, check };
}
