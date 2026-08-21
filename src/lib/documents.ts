/**
 * Regels en hulpfuncties rond projectdocumenten. Bewust vrij van Supabase- of
 * React-afhankelijkheden, zodat zowel de server als de browser dit kan gebruiken.
 */

/** Naam van de (private) Supabase Storage bucket. */
export const DOCUMENT_BUCKET = "project-documents";

/** Maximale bestandsgrootte per document: 25 MB. Gelijkgehouden met supabase/schema.sql. */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Toegestane extensies met het content type waarmee we het bestand opslaan.
 * De extensie is leidend: browsers geven voor xlsx/docx regelmatig een leeg of
 * generiek MIME-type door, dus daar kunnen we niet op vertrouwen.
 */
export const ALLOWED_FILE_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  // Inventor en Revit. Worden opgeslagen, niet gelezen: zie ANALYZABLE_FILE_TYPES.
  ipt: "application/octet-stream",
  iam: "application/octet-stream",
  idw: "application/octet-stream",
  rvt: "application/octet-stream",
  rfa: "application/octet-stream",
} as const;

export type AllowedFileType = keyof typeof ALLOWED_FILE_TYPES;

/**
 * Bestandstypen waarvoor een parser bestaat.
 *
 * PDF (offerte en tekening) en XLSX (stuklijst-export). Alle andere typen worden
 * bewaard maar niet geanalyseerd; de interface zegt dat er expliciet bij. Doe nooit
 * alsof een Inventor- of Revit-bestand al begrepen wordt.
 *
 * Deze lijst hoort gelijk te lopen met de geregistreerde parsers in
 * src/features/documents/parsers/index.ts; een test bewaakt dat.
 */
export const ANALYZABLE_FILE_TYPES: readonly string[] = ["pdf", "xlsm", "xlsx"];

/** Vaste melding bij bestanden die we bewaren maar niet lezen. */
export const UNSUPPORTED_ANALYSIS_MESSAGE = "Opgeslagen, analyse momenteel niet ondersteund.";

export function isAnalyzableFileType(extension: string): boolean {
  return ANALYZABLE_FILE_TYPES.includes(extension);
}

/** Omschrijving van bestandstypen die bewust nog niet worden gelezen. */
export const UNSUPPORTED_TYPE_LABELS: Record<string, string> = {
  ipt: "Inventor onderdeel",
  iam: "Inventor assembly",
  idw: "Inventor tekening",
  rvt: "Revit model",
  rfa: "Revit familie",
  xls: "Excel-werkblad (oud formaat)",
  docx: "Word-document",
  csv: "CSV-bestand",
  png: "Afbeelding",
  jpg: "Afbeelding",
  jpeg: "Afbeelding",
};

export function describeUnsupportedType(extension: string): string {
  return UNSUPPORTED_TYPE_LABELS[extension] ?? "Dit bestandstype";
}

/** Volledige melding voor een bestand dat niet geanalyseerd wordt. */
export function describeUnsupportedReason(extension: string): string {
  return `${describeUnsupportedType(extension)}. ${UNSUPPORTED_ANALYSIS_MESSAGE}`;
}

/** Waarde voor het `accept`-attribuut van een file input. */
export const FILE_INPUT_ACCEPT = Object.keys(ALLOWED_FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

/** Extensie zonder punt, in kleine letters. Leeg wanneer het bestand er geen heeft. */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 1 || lastDot === fileName.length - 1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function isAllowedFileType(extension: string): extension is AllowedFileType {
  return extension in ALLOWED_FILE_TYPES;
}

export type FileValidationResult =
  | { ok: true; extension: AllowedFileType; contentType: string }
  | { ok: false; message: string };

/** Controleert bestandstype en -grootte. Wordt zowel in de browser als op de server gebruikt. */
export function validateUpload(fileName: string, fileSize: number): FileValidationResult {
  const extension = getFileExtension(fileName);

  if (!isAllowedFileType(extension)) {
    return {
      ok: false,
      message: `Bestandstype "${extension || "onbekend"}" wordt niet ondersteund. Toegestaan: ${Object.keys(ALLOWED_FILE_TYPES).join(", ")}.`,
    };
  }

  if (fileSize <= 0) {
    return { ok: false, message: "Het bestand is leeg." };
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `Het bestand is groter dan ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`,
    };
  }

  return { ok: true, extension, contentType: ALLOWED_FILE_TYPES[extension] };
}

/**
 * Bouwt het opslagpad: projects/{project_id}/{uniek}-{bestandsnaam}.
 * De unieke prefix voorkomt dat een tweede upload met dezelfde naam de eerste
 * overschrijft; de originele bestandsnaam blijft in de database bewaard.
 */
export function buildStoragePath(projectId: string, fileName: string): string {
  const extension = getFileExtension(fileName);
  const base = fileName
    .slice(0, extension ? fileName.length - extension.length - 1 : undefined)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const safeName = base || "document";
  return `projects/${projectId}/${crypto.randomUUID()}-${safeName}.${extension}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "short",
  timeZone: "Europe/Amsterdam",
});

export function formatDateTime(isoString: string): string {
  return dateTimeFormatter.format(new Date(isoString));
}

export function formatDate(isoString: string): string {
  return dateFormatter.format(new Date(isoString));
}
