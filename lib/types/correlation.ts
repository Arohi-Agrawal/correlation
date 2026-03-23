// Core types for the correlation engine

export type ObservedType =
  | 'amount'
  | 'debit_amount'
  | 'credit_amount'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'account_number'
  | 'card_number'
  | 'masked_card_number'
  | 'transaction_id'
  | 'reference_number'
  | 'auth_code'
  | 'response_code'
  | 'merchant_text'
  | 'narration_text'
  | 'status_code'
  | 'country_code'
  | 'mcc'
  | 'generic_text'
  | 'generic_numeric'
  | 'unknown';

export interface ColumnProfile {
  originalHeader: string;
  normalizedHeader: string;
  sampleValues: string[];
  normalizedSampleValues: string[];
  nullRatio: number;
  distinctRatio: number;
  avgLength: number;
  minLength: number;
  maxLength: number;
  numericLikeRatio: number;
  integerLikeRatio: number;
  decimalLikeRatio: number;
  dateLikeRatio: number;
  datetimeLikeRatio: number;
  textLikeRatio: number;
  uppercaseRatio: number;
  maskedRatio: number;
  repeatedValueRatio: number;
  topFrequentValues: string[];
  uniqueValueSet: Set<string>;
  frequencyMap: Record<string, number>;
  transformedSignatures: Record<string, string[]>;
  observedType: ObservedType;
  businessHints: string[];
}

export type DecisionLabel =
  | 'ACCEPT_EXACT'
  | 'ACCEPT_EXACT_PARTIAL'
  | 'ACCEPT_STRONG_DOMAIN_MATCH'
  | 'ACCEPT_TRANSFORMED'
  | 'ACCEPT_SEMANTIC'
  | 'DERIVED_MATCH'
  | 'REJECT_DUPLICATE'
  | 'REJECT_SHIFTED_HEADER'
  | 'REJECT_WEAK'
  | 'UNMATCHED';

export interface MatchCandidate {
  sourceColumn: string;
  targetColumn: string;
  category: string;
  decision: DecisionLabel;
  confidence: number;
  sourceObservedType: ObservedType;
  targetObservedType: ObservedType;
  sourceCoverage: number;
  targetCoverage: number;
  overlapScore: number;
  transformedScore: number;
  semanticScore: number;
  duplicatePenalty: number;
  schemaShiftPenalty: number;
  reason: string;
  rejectionReason?: string;
  alternatives: string[];
}

export interface CorrelationResult {
  fileA: {
    name: string;
    columns: ColumnProfile[];
  };
  fileB: {
    name: string;
    columns: ColumnProfile[];
  };
  exactMatches: MatchCandidate[];
  exactPartialMatches: MatchCandidate[];
  strongDomainMatches: MatchCandidate[];
  transformedMatches: MatchCandidate[];
  semanticMatches: MatchCandidate[];
  derivedMatches: MatchCandidate[];
  duplicateOrSuspicious: MatchCandidate[];
  unmatched: MatchCandidate[];
  schemaWarnings: string[];
  summary: {
    totalSourceColumns: number;
    exact: number;
    exactPartial: number;
    strongDomain: number;
    transformed: number;
    semantic: number;
    derived: number;
    duplicateOrSuspicious: number;
    unmatched: number;
  };
}
