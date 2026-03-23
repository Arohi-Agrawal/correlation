export type FileSide = "A" | "B";

export type InferredColumnType =
  | "transaction_id"
  | "reference_number"
  | "amount"
  | "debit_credit"
  | "debit_amount"
  | "credit_amount"
  | "currency"
  | "date"
  | "datetime"
  | "card_number"
  | "account_number"
  | "masked_pan"
  | "merchant_text"
  | "narration_text"
  | "merchant_name"
  | "narration"
  | "status_code"
  | "auth_code"
  | "customer_id"
  | "branch_code"
  | "generic_text"
  | "generic_numeric"
  | "unknown";

export interface ParsedColumn {
  id: string;
  side: FileSide;
  sourceIndex: number;
  originalName: string;
  normalizedName: string;
  safeName: string;
  values: Array<string | null>;
}

export interface ParsedFile {
  name: string;
  side: FileSide;
  sheetName?: string;
  availableSheets?: string[];
  rowCount: number;
  columnCount: number;
  columns: ParsedColumn[];
  previewRows: Record<string, string | null>[];
}

export interface ColumnProfile {
  columnId: string;
  inferredType: InferredColumnType;
  nullRatio: number;
  uniquenessRatio: number;
  distinctSample: string[];
  patternHints: string[];
}

export interface SimilarityBreakdown {
  headerScore: number;
  valueScore: number;
  typeScore: number;
  metadataScore: number;
  totalScore: number;
}

export interface MatchCandidate {
  sourceColumnId: string;
  sourceColumnName: string;
  targetColumnId: string;
  targetColumnName: string;
  sourceType: InferredColumnType;
  targetType: InferredColumnType;
  confidence: number;
  status: "matched" | "weak" | "ambiguous" | "unmatched";
  reason: string[];
  scores: SimilarityBreakdown;
  evidence: {
    exact: number;
    transformed: number;
    semantic: number;
  };
}

export type FinalMappingDecision =
  | "ACCEPT_EXACT"
  | "ACCEPT_EXACT_PARTIAL"
  | "ACCEPT_STRONG_DOMAIN_MATCH"
  | "ACCEPT_TRANSFORMED"
  | "ACCEPT_SEMANTIC"
  | "DERIVED_MATCH"
  | "REJECT_SHIFTED_HEADER"
  | "REJECT_DUPLICATE"
  | "REJECT_WEAK"
  | "UNMATCHED";

export type MappingCategory = "exact" | "transformed" | "semantic" | "derived" | "unmatched";

export type HeaderTrustLevel = "high" | "medium" | "low";

export interface ValueEvidence {
  exactOverlap: number;
  transformedOverlap: number;
  semanticScore: number;
  rowSupport: number;
  lowCardinalityRisk: boolean;
}

export interface OverlapMetrics {
  sourceCoverage: number;
  targetCoverage: number;
  transformedCoverage: number;
  semanticScore: number;
}

export interface FinalizedMatch {
  sourceColumnId: string;
  sourceColumnName: string;
  sourceColumn: string;
  targetColumnId: string;
  targetColumnName: string;
  targetColumn: string;
  confidence: number;
  category: Exclude<MappingCategory, "unmatched">;
  finalMappingDecision: "ACCEPT_EXACT" | "ACCEPT_EXACT_PARTIAL" | "ACCEPT_STRONG_DOMAIN_MATCH" | "ACCEPT_TRANSFORMED" | "ACCEPT_SEMANTIC";
  decision: "ACCEPT_EXACT" | "ACCEPT_EXACT_PARTIAL" | "ACCEPT_STRONG_DOMAIN_MATCH" | "ACCEPT_TRANSFORMED" | "ACCEPT_SEMANTIC";
  sourceObservedType: InferredColumnType;
  targetObservedType: InferredColumnType;
  headerTrust: HeaderTrustLevel;
  headerTrustLevel: HeaderTrustLevel;
  sourceCoverage: number;
  targetCoverage: number;
  overlapScore: number;
  transformedScore: number;
  semanticScore: number;
  duplicatePenalty: number;
  overlapMetrics: OverlapMetrics;
  valueEvidence: ValueEvidence;
  reason: string[];
}

export interface DerivedMatch {
  sourceColumnId: string;
  sourceColumnName: string;
  sourceColumn: string;
  targetColumnId: string;
  targetColumnName: string;
  targetColumn: string;
  category: "derived";
  decision: "DERIVED_MATCH";
  finalMappingDecision: "DERIVED_MATCH";
  confidence: number;
  sourceObservedType: InferredColumnType;
  targetObservedType: InferredColumnType;
  headerTrust: HeaderTrustLevel;
  headerTrustLevel: HeaderTrustLevel;
  sourceCoverage: number;
  targetCoverage: number;
  overlapScore: number;
  transformedScore: number;
  semanticScore: number;
  duplicatePenalty: number;
  overlapMetrics: OverlapMetrics;
  valueEvidence: ValueEvidence;
  reason: string[];
  derivationRule: "DATE_PART" | "MASKED_IDENTIFIER" | "NORMALIZED_NUMERIC";
}

export interface RejectedMatch {
  sourceColumnId: string;
  sourceColumnName: string;
  sourceColumn: string;
  targetColumnId: string | null;
  targetColumnName: string | null;
  targetColumn: string | null;
  category: "rejected" | "duplicate_or_suspicious";
  decision: "REJECT_SHIFTED_HEADER" | "REJECT_DUPLICATE" | "REJECT_WEAK";
  confidence: number;
  sourceObservedType: InferredColumnType;
  targetObservedType: InferredColumnType | "unknown";
  headerTrust: HeaderTrustLevel;
  headerTrustLevel: HeaderTrustLevel;
  sourceCoverage: number;
  targetCoverage: number;
  overlapScore: number;
  transformedScore: number;
  semanticScore: number;
  duplicatePenalty: number;
  overlapMetrics: OverlapMetrics;
  valueEvidence: ValueEvidence;
  reason: string[];
  rejectionReason: string;
}

export interface UnmatchedColumn {
  sourceColumnId: string;
  sourceColumnName: string;
  sourceColumn: string;
  targetColumnId: null;
  targetColumnName: null;
  targetColumn: null;
  category: "unmatched";
  decision: "UNMATCHED" | "REJECT_WEAK" | "REJECT_DUPLICATE" | "REJECT_SHIFTED_HEADER";
  confidence: number;
  sourceObservedType: InferredColumnType;
  targetObservedType: "unknown";
  headerTrust: HeaderTrustLevel;
  sourceCoverage: number;
  targetCoverage: number;
  overlapScore: number;
  transformedScore: number;
  semanticScore: number;
  duplicatePenalty: number;
  overlapMetrics: OverlapMetrics;
  rejectionReason: string;
  finalMappingDecision: "REJECT_WEAK" | "UNMATCHED" | "REJECT_DUPLICATE" | "REJECT_SHIFTED_HEADER";
  reason: string[];
}

export interface DuplicateOrSuspiciousColumn {
  columnId: string;
  columnName: string;
  canonicalColumnId: string;
  canonicalColumnName: string;
  reason: string;
}

export interface CorrelationResultItem {
  sourceColumnId: string;
  sourceColumnName: string;
  sourceType: InferredColumnType;
  bestMatch: MatchCandidate | null;
  alternatives: MatchCandidate[];
  mappingCategory: Exclude<MappingCategory, "derived">;
  finalMappingDecision: FinalMappingDecision;
  finalReason: string[];
  headerTrustLevel: HeaderTrustLevel;
  sourceObservedType: InferredColumnType;
}

export interface SchemaWarning {
  fileSide: FileSide;
  warningCode: "SCHEMA_SHIFT_SUSPECTED" | "HEADER_VALUE_INCONSISTENT";
  severity: "info" | "warning" | "critical";
  message: string;
  affectedColumns: string[];
}

export interface CorrelationSummary {
  totalSourceColumns: number;
  exact: number;
  exactPartial: number;
  strongDomain: number;
  transformed: number;
  semantic: number;
  derived: number;
  duplicateOrSuspicious: number;
  unmatched: number;
}

export interface ReverseCheckItem {
  targetColumnId: string;
  targetColumnName: string;
  bestSourceColumnId: string | null;
  bestSourceColumnName: string | null;
  confidence: number;
  status: "matched" | "weak" | "ambiguous" | "unmatched";
}

export interface CorrelationResponse {
  fileA: Pick<ParsedFile, "name" | "columns" | "sheetName">;
  fileB: Pick<ParsedFile, "name" | "columns" | "sheetName">;
  exactMatches: FinalizedMatch[];
  exactPartialMatches: FinalizedMatch[];
  strongDomainMatches: FinalizedMatch[];
  transformedMatches: FinalizedMatch[];
  semanticMatches: FinalizedMatch[];
  derivedMatches: DerivedMatch[];
  rejectedMatches: RejectedMatch[];
  unmatched: UnmatchedColumn[];
  duplicateOrSuspicious: RejectedMatch[];
  duplicateOrSuspiciousColumns: DuplicateOrSuspiciousColumn[];
  schemaWarnings: SchemaWarning[];
  results: CorrelationResultItem[];
  reverseCheck: ReverseCheckItem[];
  summary: CorrelationSummary;
}

export interface ScoringWeights {
  headerWeight: number;
  valueWeight: number;
  typeWeight: number;
  metadataWeight: number;
}

export interface CorrelationConfig {
  weights: ScoringWeights;
  strongThreshold: number;
  mediumThreshold: number;
  weakThreshold: number;
  ambiguousDelta: number;
}

export interface CorrelateRequestBody {
  fileA: {
    fileName: string;
    extension: string;
    sheetName?: string;
    contentBase64: string;
  };
  fileB: {
    fileName: string;
    extension: string;
    sheetName?: string;
    contentBase64: string;
  };
}

export interface FeedbackEntry {
  sourceColumnId: string;
  selectedTargetColumnId: string | null;
  verdict: "correct" | "incorrect" | "pending";
  updatedAt: string;
}
