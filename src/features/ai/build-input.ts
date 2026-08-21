import { MAX_ANALYSIS_CHARS, MIN_USABLE_CHARS } from "@/features/ai/limits";
import type { AnalysisDocument } from "@/features/ai/verify-findings";
import type { DocumentRole, Project } from "@/types/database";

export type ProjectSummary = Pick<
  Project,
  "project_number" | "name" | "description" | "unit_type" | "quantity"
>;

export const ROLE_LABELS: Record<DocumentRole, string> = {
  offer: "Offerte",
  drawing: "Tekening",
  bill_of_materials: "Stuklijst",
  specification: "Specificatie",
  other: "Overig document",
  unknown: "Rol niet aangegeven",
};

/** Volgorde waarin rollen worden aangeboden: eerst de bronnen die vergeleken worden. */
const ROLE_ORDER: DocumentRole[] = [
  "offer",
  "drawing",
  "bill_of_materials",
  "specification",
  "other",
  "unknown",
];

/** Documenten met te weinig tekst zijn vermoedelijk scans of tekeningen; die kan
 *  deze versie nog niet lezen en laten we buiten de analyse. */
export function hasUsableText(document: AnalysisDocument): boolean {
  return document.pages.join(" ").trim().length >= MIN_USABLE_CHARS;
}

/** Sorteert documenten op rol, zodat de nummering een logische volgorde volgt. */
export function orderByRole(documents: AnalysisDocument[]): AnalysisDocument[] {
  return [...documents].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );
}

/** Welke van de vijf controles zinvol zijn met de aanwezige documentrollen. */
export function availableComparisons(documents: AnalysisDocument[]): {
  offerVsDrawing: boolean;
  drawingVsBom: boolean;
  offerVsBom: boolean;
} {
  const roles = new Set(documents.map((document) => document.role));
  return {
    offerVsDrawing: roles.has("offer") && roles.has("drawing"),
    drawingVsBom: roles.has("drawing") && roles.has("bill_of_materials"),
    offerVsBom: roles.has("offer") && roles.has("bill_of_materials"),
  };
}

/**
 * Bouwt de invoer voor een provider: projectgegevens plus de documenttekst met
 * documentrol, document- en paginanummers. Die nummers zijn de basis voor
 * bronverwijzingen.
 *
 * Kapt af op MAX_ANALYSIS_CHARS zodat geheugengebruik en kosten begrensd blijven,
 * en meldt in de tekst zelf wat is weggelaten.
 */
export function buildAnalysisInput(
  project: ProjectSummary,
  documents: AnalysisDocument[],
  maxChars = MAX_ANALYSIS_CHARS,
): string {
  const comparisons = availableComparisons(documents);

  const header = [
    "# Project",
    `Projectnummer: ${project.project_number}`,
    `Projectnaam: ${project.name}`,
    `Type unit: ${project.unit_type ?? "niet ingevuld"}`,
    `Aantal units: ${project.quantity}`,
    `Omschrijving: ${project.description ?? "niet ingevuld"}`,
    "",
    "# Beschikbare vergelijkingen",
    `Offerte tegenover tekening: ${comparisons.offerVsDrawing ? "mogelijk" : "niet mogelijk, een van beide ontbreekt"}`,
    `Tekening tegenover stuklijst: ${comparisons.drawingVsBom ? "mogelijk" : "niet mogelijk, een van beide ontbreekt"}`,
    `Offerte tegenover stuklijst: ${comparisons.offerVsBom ? "mogelijk" : "niet mogelijk, een van beide ontbreekt"}`,
    "",
    "# Documenten",
    "",
  ].join("\n");

  /** Onder deze grens heeft een gedeeltelijk document te weinig context om nuttig te zijn. */
  const MIN_PARTIAL_CHARS = 500;
  const TRUNCATION_NOTE = "\n\n[dit document is hier afgekapt vanwege lengte]";

  const blocks: string[] = [];
  const truncated: string[] = [];
  const omitted: string[] = [];
  let used = header.length;

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    const label = `Document ${index + 1} (${document.fileName})`;
    const title = `## Document ${index + 1}: ${document.fileName} — rol: ${ROLE_LABELS[document.role]}`;
    const pages = document.pages
      .map((page, pageIndex) => `[pagina ${pageIndex + 1}]\n${page}`)
      .join("\n\n");
    const block = `${title}\n\n${pages}`;

    if (used + block.length <= maxChars) {
      blocks.push(block);
      used += block.length + 2;
      continue;
    }

    const room = maxChars - used - title.length - TRUNCATION_NOTE.length - 4;
    if (room >= MIN_PARTIAL_CHARS) {
      blocks.push(`${title}\n\n${pages.slice(0, room)}${TRUNCATION_NOTE}`);
      used = maxChars;
      truncated.push(label);
    } else {
      omitted.push(label);
    }
  }

  const warnings: string[] = [];
  if (truncated.length) {
    warnings.push(`Gedeeltelijk weggelaten vanwege lengte: ${truncated.join(", ")}.`);
  }
  if (omitted.length) {
    warnings.push(`Volledig weggelaten vanwege lengte: ${omitted.join(", ")}.`);
  }

  const footer = warnings.length
    ? `\n\n# Let op\n${warnings.join(" ")} Baseer geen bevindingen op wat je niet hebt gezien.`
    : "";

  const instruction =
    "\n\n# Opdracht\nVoer de vijf controles uit voor zover de aanwezige documentrollen dat toelaten. Citeer bij elke constatering letterlijk uit de documenttekst hierboven en verwijs naar het documentnummer. Neem nooit aan wat een correcte uitvoering hoort te zijn. Vind je niets dat aan je regels voldoet, geef dan een lege lijst terug.";

  return header + blocks.join("\n\n") + footer + instruction;
}
