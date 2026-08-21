import { WORK_PREPARATION_V1 } from "./work-preparation-v1";
import { WORK_PREPARATION_V2 } from "./work-preparation-v2";

export type CheckProfile = {
  version: string;
  label: string;
  systemPrompt: string;
};

/** Alle bekende controleprofielen, op versie. Oude versies blijven staan zodat
 *  bestaande ai_checks-records naar hun profiel blijven verwijzen. */
export const CHECK_PROFILES: Record<string, CheckProfile> = {
  [WORK_PREPARATION_V1.version]: WORK_PREPARATION_V1,
  [WORK_PREPARATION_V2.version]: WORK_PREPARATION_V2,
};

/** Het profiel dat nieuwe controles gebruiken. */
export const ACTIVE_PROFILE: CheckProfile = WORK_PREPARATION_V2;

export function getProfile(version: string): CheckProfile | null {
  return CHECK_PROFILES[version] ?? null;
}
