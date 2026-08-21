import type { PreparedDocument } from "@/features/ai/prepare-analysis";

/**
 * Staat hier en niet in actions.ts: uit een "use server"-bestand mogen alleen
 * async functies worden geëxporteerd, geen constanten.
 */
export type PrepareState = {
  error: string | null;
  overview: PreparedDocument[] | null;
  problems: string[];
  inputPreview: string | null;
  inputLength: number;
};

export const emptyPrepareState: PrepareState = {
  error: null,
  overview: null,
  problems: [],
  inputPreview: null,
  inputLength: 0,
};
