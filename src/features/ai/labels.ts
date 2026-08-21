import type {
  AiCheckStatus,
  CheckArea,
  ConfidenceLevel,
  FindingCategory,
  FindingSeverity,
  FindingStatus,
  FindingType,
} from "@/types/database";

/**
 * Het soort constatering. Dit is wat de werkvoorbereider als eerste moet zien:
 * is er bewijs van een fout, ontbreekt er iets, of moet er alleen gekeken worden?
 */
export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  discrepancy: "Afwijking",
  missing: "Mogelijk ontbrekend",
  attention: "Aandachtspunt",
};

export const FINDING_TYPE_PLURAL: Record<FindingType, string> = {
  discrepancy: "afwijkingen",
  missing: "mogelijk ontbrekend",
  attention: "aandachtspunten",
};

export const FINDING_TYPE_EXPLANATION: Record<FindingType, string> = {
  discrepancy: "Twee documenten spreken elkaar aantoonbaar tegen.",
  missing: "Op basis van één bron verwacht, niet teruggevonden in de andere.",
  attention: "Te weinig informatie om iets vast te stellen; verdient controle.",
};

export const FINDING_TYPE_DOT: Record<FindingType, string> = {
  discrepancy: "bg-red-500",
  missing: "bg-orange-400",
  attention: "bg-amber-300",
};

export const FINDING_TYPE_CARD: Record<FindingType, string> = {
  discrepancy: "border-red-200 bg-red-50/50",
  missing: "border-orange-200 bg-orange-50/40",
  attention: "border-amber-200 bg-amber-50/30",
};

/** De vijf controles van het Brouwer-profiel, in de volgorde waarin ze draaien. */
export const CHECK_AREA_LABELS: Record<CheckArea, string> = {
  offer_vs_drawing: "Offerte ↔ tekening",
  drawing_vs_bom: "Tekening ↔ stuklijst",
  offer_vs_bom: "Offerte ↔ stuklijst",
  dimensions: "Maatvoering",
  location: "Locatie",
  general: "Algemeen",
};

export const CHECK_AREA_ORDER: CheckArea[] = [
  "offer_vs_drawing",
  "drawing_vs_bom",
  "offer_vs_bom",
  "dimensions",
  "location",
  "general",
];

/**
 * De severity zegt wát voor soort bevinding het is, niet alleen hoe erg.
 * Die driedeling komt uit het controleprofiel en moet in de UI herkenbaar blijven.
 */
export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  high: "Mogelijke afwijking",
  medium: "Ontbrekende gegevens",
  low: "Aandachtspunt",
};

export const SEVERITY_PLURAL: Record<FindingSeverity, string> = {
  high: "mogelijke afwijkingen",
  medium: "ontbrekende gegevens",
  low: "aandachtspunten",
};

export const SEVERITY_EXPLANATION: Record<FindingSeverity, string> = {
  high: "Concrete tegenstrijdige informatie in de documenten.",
  medium: "Benodigde informatie ontbreekt aantoonbaar.",
  low: "Reden om na te kijken, geen bewijs dat er iets fout is.",
};

export const SEVERITY_DOT: Record<FindingSeverity, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-amber-300",
};

export const SEVERITY_CARD: Record<FindingSeverity, string> = {
  high: "border-red-200 bg-red-50/50",
  medium: "border-orange-200 bg-orange-50/40",
  low: "border-amber-200 bg-amber-50/30",
};

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  completeness: "Compleetheid",
  consistency: "Consistentie",
  quantity: "Aantallen",
  logical: "Logica",
  production: "Productie",
  other: "Overig",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "Hoge zekerheid",
  medium: "Redelijke zekerheid",
  low: "Lage zekerheid",
};

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Nog niet beoordeeld",
  accepted: "Terecht",
  rejected: "Onterecht",
  needs_review: "Nader controleren",
};

export const FINDING_STATUS_STYLES: Record<FindingStatus, string> = {
  open: "bg-slate-100 text-slate-600 ring-slate-200",
  accepted: "bg-red-100 text-red-800 ring-red-200",
  rejected: "bg-slate-100 text-slate-500 ring-slate-200",
  needs_review: "bg-blue-100 text-blue-800 ring-blue-200",
};

export const AI_CHECK_STATUS_LABELS: Record<AiCheckStatus, string> = {
  pending: "In wachtrij",
  processing: "Bezig",
  completed: "Voltooid",
  failed: "Mislukt",
};
