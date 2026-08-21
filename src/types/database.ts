export const PROJECT_STATUSES = [
  "draft",
  "ready_for_check",
  "checking",
  "completed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  project_number: string;
  name: string;
  description: string | null;
  unit_type: string | null;
  quantity: number;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export const DOCUMENT_ROLES = [
  "offer",
  "drawing",
  "bill_of_materials",
  "specification",
  "other",
  "unknown",
] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export type ProjectDocument = {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  file_size: number;
  document_role: DocumentRole;
  source_id: string;
  created_at: string;
};

export type ProjectWithDocuments = Project & {
  project_documents: ProjectDocument[];
};

// --- v0.2: documentanalyse en AI-controle ---------------------------------

export const EXTRACTION_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export type DocumentContent = {
  id: string;
  document_id: string;
  extracted_text: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  page_count: number | null;
  truncated: boolean;
  created_at: string;
  updated_at: string;
};

export const AI_CHECK_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type AiCheckStatus = (typeof AI_CHECK_STATUSES)[number];

export type AiCheck = {
  id: string;
  project_id: string;
  status: AiCheckStatus;
  model: string | null;
  prompt_version: string | null;
  profile_label: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  documents_analyzed: number;
  documents_unsupported: number;
  findings_rejected: number;
  source_id: string | null;
  error: string | null;
  created_at: string;
};

export const FINDING_SEVERITIES = ["high", "medium", "low"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_CATEGORIES = [
  "completeness",
  "consistency",
  "quantity",
  "logical",
  "production",
  "other",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

/**
 * Wat voor soort constatering het is. Staat los van severity: severity zegt hoe
 * zwaar iets weegt, finding_type zegt waar de constatering op rust.
 */
export const FINDING_TYPES = ["discrepancy", "missing", "attention"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

/** De vijf controles van het Brouwer-profiel. 'general' is voor bevindingen van v0.2. */
export const CHECK_AREAS = [
  "offer_vs_drawing",
  "drawing_vs_bom",
  "offer_vs_bom",
  "dimensions",
  "location",
  "general",
] as const;
export type CheckArea = (typeof CHECK_AREAS)[number];

export const FINDING_STATUSES = ["open", "accepted", "rejected", "needs_review"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export type AiFinding = {
  id: string;
  ai_check_id: string;
  finding_type: FindingType;
  check_area: CheckArea;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  source_document_id: string;
  source_reference: string;
  source_quote: string;
  compared_document_id: string | null;
  compared_reference: string | null;
  compared_quote: string | null;
  confidence: ConfidenceLevel;
  status: FindingStatus;
  reviewed_at: string | null;
  created_at: string;
};

export type AiCheckWithFindings = AiCheck & {
  ai_findings: AiFinding[];
};
