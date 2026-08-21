import { describe, expect, it } from "vitest";

import {
  ALLOWED_FILE_TYPES,
  ANALYZABLE_FILE_TYPES,
  describeUnsupportedType,
  isAnalyzableFileType,
  validateUpload,
  UNSUPPORTED_ANALYSIS_MESSAGE,
  describeUnsupportedReason,
} from "./documents";
import { parsableFileTypes } from "@/features/documents/parsers";

describe("Inventor- en Revit-bestanden", () => {
  const cadFiles = [
    ["unit.iam", "Inventor assembly"],
    ["paneel.ipt", "Inventor onderdeel"],
    ["plattegrond.idw", "Inventor tekening"],
    ["unit.rvt", "Revit model"],
    ["deur.rfa", "Revit familie"],
  ];

  it.each(cadFiles)("mogen worden opgeslagen: %s", (fileName) => {
    const result = validateUpload(fileName as string, 1024);

    expect(result.ok).toBe(true);
  });

  it.each(cadFiles)("worden niet geanalyseerd: %s", (fileName) => {
    const extension = (fileName as string).split(".").pop()!;

    expect(isAnalyzableFileType(extension)).toBe(false);
  });

  it.each(cadFiles)("krijgen een leesbare omschrijving: %s -> %s", (fileName, label) => {
    const extension = (fileName as string).split(".").pop()!;

    expect(describeUnsupportedType(extension)).toBe(label);
  });

  // Test I uit de opdracht.
  it.each(cadFiles)("melden expliciet dat analyse niet wordt ondersteund: %s", (fileName) => {
    const extension = (fileName as string).split(".").pop()!;
    const reason = describeUnsupportedReason(extension);

    expect(reason).toContain(UNSUPPORTED_ANALYSIS_MESSAGE);
    expect(UNSUPPORTED_ANALYSIS_MESSAGE).toBe("Opgeslagen, analyse momenteel niet ondersteund.");
  });
});

describe("welke bestandstypen worden gelezen", () => {
  it("leest PDF en de xlsx-stuklijst", () => {
    expect(ANALYZABLE_FILE_TYPES).toEqual(["pdf", "xlsm", "xlsx"]);
    expect(isAnalyzableFileType("pdf")).toBe(true);
    expect(isAnalyzableFileType("xlsx")).toBe(true);
  });

  it("loopt gelijk met de geregistreerde parsers", () => {
    expect([...ANALYZABLE_FILE_TYPES].sort()).toEqual(parsableFileTypes());
  });

  it("leest geen Word, CSV of afbeeldingen, ook al mogen die wel geüpload worden", () => {
    for (const extension of ["xls", "docx", "csv", "png", "jpg", "jpeg"]) {
      expect(extension in ALLOWED_FILE_TYPES).toBe(true);
      expect(isAnalyzableFileType(extension)).toBe(false);
    }
  });

  it("weigert een bestandstype dat we helemaal niet ondersteunen", () => {
    const result = validateUpload("model.step", 1024);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("niet ondersteund");
  });

  it("geeft een algemene omschrijving voor een onbekende extensie", () => {
    expect(describeUnsupportedType("step")).toBe("Dit bestandstype");
  });
});
