import { correlationConfig } from "@/lib/config/scoring";
import { compareHeaders } from "@/lib/correlation/headerSimilarity";
import { profileColumn } from "@/lib/correlation/profiler";
import { compareColumnTypes, detectObservedType } from "@/lib/correlation/typeDetection";
import { datePart, normalizeAmountLike, panFingerprint, stripPaddedNumeric } from "@/lib/correlation/transforms";
import {
  CorrelationResponse,
  CorrelationResultItem,
  CorrelationSummary,
  DerivedMatch,
  DuplicateOrSuspiciousColumn,
  FinalizedMatch,
  HeaderTrustLevel,
  InferredColumnType,
  MappingCategory,
  MatchCandidate,
  OverlapMetrics,
  ParsedColumn,
  ParsedFile,
  RejectedMatch,
  ReverseCheckItem,
  SchemaWarning,
  UnmatchedColumn,
  ValueEvidence
} from "@/lib/types";

type ProfiledColumn = {
  column: ParsedColumn;
  observedType: InferredColumnType;
  inferredType: InferredColumnType;
  nullRatio: number;
  uniquenessRatio: number;
  sampleValues: string[];
  rawSet: Set<string>;
  sampleSet: Set<string>;
  dateSet: Set<string>;
  amountSet: Set<string>;
  panSet: Set<string>;
  paddedSet: Set<string>;
  semanticTokenSet: Set<string>;
  topFrequentValues: Array<{ value: string; ratio: number }>;
};

type TransformCoverage = {
  dateCoverage: number;
  amountCoverage: number;
  panCoverageSource: number;
  panCoverageTarget: number;
  paddedCoverage: number;
  maxCoverage: number;
};

type QuickCandidate = {
  targetId: string;
  quickScore: number;
  typeScore: number;
  sampleOverlap: number;
  transformHint: number;
};

const SAMPLE_LIMIT = 350;
const SHORTLIST_LIMIT = 7;
const EXACT_SOURCE_COVERAGE_STRONG = 0.9;
const EXACT_TARGET_COVERAGE_STRONG = 0.83;
const EXACT_SOURCE_COVERAGE_PARTIAL = 0.75;
const EXACT_TARGET_COVERAGE_PARTIAL = 0.58;
const TRANSFORMED_COVERAGE_ACCEPT = 0.8;
const SEMANTIC_ACCEPT = 0.62;

function toSet(values: string[]): Set<string> {
  return new Set(values);
}

function topFrequent(values: string[], limit = 4): Array<{ value: string; ratio: number }> {
  if (!values.length) return [];
  const counts = new Map<string, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, ratio: count / values.length }));
}

function semanticTokens(values: string[]): Set<string> {
  const tokens = new Set<string>();
  values.forEach((value) => {
    value
      .toLowerCase()
      .replace(/\b(pos|swipe|atm|cash|others|swt|purchase|transaction|txn|entry|date|time|timestamp|withdrawal|oth|live|normaltrx|normal_trx)\b/g, " ")
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .forEach((token) => tokens.add(token));
  });
  return tokens;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const value of a) {
    if (b.has(value)) count += 1;
  }
  return count;
}

function coverage(a: Set<string>, b: Set<string>): { sourceCoverage: number; targetCoverage: number } {
  if (!a.size || !b.size) {
    return { sourceCoverage: 0, targetCoverage: 0 };
  }
  const inter = intersectionSize(a, b);
  return {
    sourceCoverage: inter / a.size,
    targetCoverage: inter / b.size
  };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const inter = intersectionSize(a, b);
  return inter / (new Set([...a, ...b]).size || 1);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  return intersectionSize(a, b) / Math.min(a.size, b.size);
}

function isDateLike(type: InferredColumnType): boolean {
  return type === "date" || type === "datetime";
}

function isTextLike(type: InferredColumnType): boolean {
  return ["narration", "narration_text", "merchant_name", "merchant_text", "generic_text", "reference_number", "transaction_id"].includes(type);
}

function inferHeaderExpectedType(header: string): InferredColumnType {
  const h = header.toLowerCase();
  if (/amount|amt|value/.test(h)) return "amount";
  if (/date|datetime|timestamp|time/.test(h)) return "datetime";
  if (/part[_\s-]?tran[_\s-]?type|tran[_\s-]?type|debit[_\s-]?credit|drcr/.test(h)) return "debit_credit";
  if (/account|acct|iban/.test(h)) return "account_number";
  if (/card|pan/.test(h)) return "card_number";
  if (/rrn|stan|trace|ref|transaction id|txn id/.test(h)) return "transaction_id";
  if (/narration|description|merchant|particular/.test(h)) return "narration_text";
  if (/currency|ccy|curr/.test(h)) return "currency";
  if (/status|response/.test(h)) return "status_code";
  return "unknown";
}

function headerBusinessAlignmentScore(columnName: string, observedType: InferredColumnType): number {
  const expected = inferHeaderExpectedType(columnName);
  if (expected === "unknown") return 45;
  return compareColumnTypes(expected, observedType).score;
}

function buildProfile(column: ParsedColumn): ProfiledColumn {
  const fullNonNull = column.values.filter((value): value is string => value !== null);
  const sampleValues = fullNonNull.slice(0, SAMPLE_LIMIT);
  const baseProfile = profileColumn(column);

  return {
    column,
    observedType: detectObservedType(fullNonNull),
    inferredType: baseProfile.observedType as InferredColumnType,
    nullRatio: baseProfile.nullRatio,
    uniquenessRatio: baseProfile.distinctRatio,
    sampleValues,
    rawSet: toSet(fullNonNull),
    sampleSet: toSet(fullNonNull),
    dateSet: toSet(fullNonNull.map((value) => datePart(value))),
    amountSet: toSet(fullNonNull.map((value) => normalizeAmountLike(value))),
    panSet: toSet(fullNonNull.map((value) => panFingerprint(value)).filter((value): value is string => Boolean(value))),
    paddedSet: toSet(fullNonNull.map((value) => stripPaddedNumeric(value))),
    semanticTokenSet: semanticTokens(fullNonNull),
    topFrequentValues: topFrequent(fullNonNull)
  };
}

function schemaSanityCheck(file: ParsedFile, profiles: ProfiledColumn[]): {
  warnings: SchemaWarning[];
  trustByColumnId: Record<string, HeaderTrustLevel>;
  shiftSuspected: boolean;
} {
  const warnings: SchemaWarning[] = [];
  const trustByColumnId: Record<string, HeaderTrustLevel> = {};
  const inconsistentIndexes: number[] = [];

  profiles.forEach((profile, idx) => {
    const expected = inferHeaderExpectedType(profile.column.originalName);
    const observed = profile.observedType;

    let trust: HeaderTrustLevel = "high";
    if (expected === "unknown") {
      trust = "medium";
    } else if (observed !== "unknown" && compareColumnTypes(expected, observed).score < 50) {
      trust = "low";
      inconsistentIndexes.push(idx);
      warnings.push({
        fileSide: file.side,
        warningCode: "HEADER_VALUE_INCONSISTENT",
        severity: "warning",
        message: `Header ${profile.column.originalName} is inconsistent with observed values`,
        affectedColumns: [profile.column.id]
      });
    }

    trustByColumnId[profile.column.id] = trust;
  });

  let maxRun = 0;
  let currentRun = 0;
  const inconsistentSet = new Set(inconsistentIndexes);
  for (let i = 0; i < profiles.length; i += 1) {
    if (inconsistentSet.has(i)) {
      currentRun += 1;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const shiftSuspected = inconsistentIndexes.length >= Math.max(2, Math.floor(profiles.length * 0.35)) || maxRun >= 2;
  if (shiftSuspected) {
    warnings.push({
      fileSide: file.side,
      warningCode: "SCHEMA_SHIFT_SUSPECTED",
      severity: "critical",
      message: "Multiple adjacent header/value mismatches indicate possible schema shift",
      affectedColumns: inconsistentIndexes.map((idx) => profiles[idx].column.id)
    });

    profiles.forEach((profile) => {
      trustByColumnId[profile.column.id] = trustByColumnId[profile.column.id] === "low" ? "low" : "medium";
    });
  }

  return { warnings, trustByColumnId, shiftSuspected };
}

function duplicateCanonicalScore(profile: ProfiledColumn): number {
  let score = 0;
  score += profile.uniquenessRatio > 0.55 ? 10 : -5;
  score += headerBusinessAlignmentScore(profile.column.originalName, profile.observedType);

  if (profile.observedType === "amount" && /amount|authorized|replaced|posted|value/i.test(profile.column.originalName)) {
    score += 30;
  }
  if (profile.observedType === "amount" && /account|acct/i.test(profile.column.originalName)) {
    score -= 35;
  }
  if (profile.observedType === "card_number" && /date|time|datetime/i.test(profile.column.originalName)) {
    score -= 12;
  }

  score -= profile.nullRatio * 10;
  return score;
}

function detectDuplicateTargets(targetProfiles: ProfiledColumn[]): {
  canonicalByColumnId: Record<string, string>;
  duplicates: DuplicateOrSuspiciousColumn[];
} {
  const canonicalByColumnId: Record<string, string> = {};
  const duplicates: DuplicateOrSuspiciousColumn[] = [];
  const visited = new Set<string>();

  targetProfiles.forEach((profile) => {
    if (visited.has(profile.column.id)) return;

    const group = [profile];
    for (const other of targetProfiles) {
      if (other.column.id === profile.column.id || visited.has(other.column.id)) continue;

      const rawNear = overlapRatio(profile.sampleSet, other.sampleSet) >= 0.97;
      const amountNear = overlapRatio(profile.amountSet, other.amountSet) >= 0.98;
      const dateNear = overlapRatio(profile.dateSet, other.dateSet) >= 0.98;
      const panNear = profile.panSet.size > 0 && overlapRatio(profile.panSet, other.panSet) >= 0.95;

      if (rawNear || amountNear || dateNear || panNear) {
        group.push(other);
      }
    }

    group.forEach((member) => visited.add(member.column.id));
    const canonical = [...group].sort((a, b) => {
      const scoreDiff = duplicateCanonicalScore(b) - duplicateCanonicalScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.column.sourceIndex - b.column.sourceIndex;
    })[0];

    group.forEach((member) => {
      canonicalByColumnId[member.column.id] = canonical.column.id;
      if (member.column.id !== canonical.column.id) {
        duplicates.push({
          columnId: member.column.id,
          columnName: member.column.originalName,
          canonicalColumnId: canonical.column.id,
          canonicalColumnName: canonical.column.originalName,
          reason: "Near-identical target column detected; weaker duplicate rejected"
        });
      }
    });
  });

  return { canonicalByColumnId, duplicates };
}

function detectDuplicateSources(sourceProfiles: ProfiledColumn[]): {
  canonicalByColumnId: Record<string, string>;
  duplicates: DuplicateOrSuspiciousColumn[];
} {
  const canonicalByColumnId: Record<string, string> = {};
  const duplicates: DuplicateOrSuspiciousColumn[] = [];
  const visited = new Set<string>();

  sourceProfiles.forEach((profile) => {
    if (visited.has(profile.column.id)) return;

    const group = [profile];
    for (const other of sourceProfiles) {
      if (other.column.id === profile.column.id || visited.has(other.column.id)) continue;

      const rawNear = overlapRatio(profile.sampleSet, other.sampleSet) >= 0.999;
      const amountNear = overlapRatio(profile.amountSet, other.amountSet) >= 0.999;
      const rowComparable = Math.min(profile.column.values.length, other.column.values.length);
      let equalCount = 0;
      for (let i = 0; i < rowComparable; i += 1) {
        if (profile.column.values[i] === other.column.values[i]) {
          equalCount += 1;
        }
      }
      const rowWiseEqual = rowComparable > 0 ? equalCount / rowComparable : 0;
      if (rawNear || amountNear) {
        group.push(other);
      } else if (rowWiseEqual >= 0.999) {
        group.push(other);
      }
    }

    group.forEach((member) => visited.add(member.column.id));
    const canonical = [...group].sort((a, b) => {
      const scoreDiff = duplicateCanonicalScore(b) - duplicateCanonicalScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.column.sourceIndex - b.column.sourceIndex;
    })[0];

    group.forEach((member) => {
      canonicalByColumnId[member.column.id] = canonical.column.id;
      if (member.column.id !== canonical.column.id) {
        duplicates.push({
          columnId: member.column.id,
          columnName: member.column.originalName,
          canonicalColumnId: canonical.column.id,
          canonicalColumnName: canonical.column.originalName,
          reason: "Near-identical source column detected; weaker duplicate rejected"
        });
      }
    });
  });

  return { canonicalByColumnId, duplicates };
}

function computeTransformCoverage(source: ProfiledColumn, target: ProfiledColumn): TransformCoverage {
  const dateCoverage = coverage(source.dateSet, target.dateSet).sourceCoverage;
  const amountCoverage = coverage(source.amountSet, target.amountSet).sourceCoverage;
  const panCover = source.panSet.size && target.panSet.size ? coverage(source.panSet, target.panSet) : { sourceCoverage: 0, targetCoverage: 0 };
  const paddedCoverage = coverage(source.paddedSet, target.paddedSet).sourceCoverage;
  return {
    dateCoverage,
    amountCoverage,
    panCoverageSource: panCover.sourceCoverage,
    panCoverageTarget: panCover.targetCoverage,
    paddedCoverage,
    maxCoverage: Math.max(dateCoverage, amountCoverage, panCover.sourceCoverage, paddedCoverage)
  };
}

function buildValueEvidence(source: ProfiledColumn, target: ProfiledColumn): ValueEvidence {
  const exact = coverage(source.rawSet, target.rawSet);
  const transformed = computeTransformCoverage(source, target);
  const semantic = jaccard(source.semanticTokenSet, target.semanticTokenSet);
  const lowCardinalityRisk = Math.max(source.topFrequentValues[0]?.ratio ?? 0, target.topFrequentValues[0]?.ratio ?? 0) >= 0.55;

  return {
    exactOverlap: Number(((exact.sourceCoverage + exact.targetCoverage) / 2).toFixed(4)),
    transformedOverlap: Number(transformed.maxCoverage.toFixed(4)),
    semanticScore: Number((semantic * 100).toFixed(2)),
    rowSupport: 0,
    lowCardinalityRisk
  };
}

function buildOverlapMetrics(source: ProfiledColumn, target: ProfiledColumn): OverlapMetrics {
  const raw = coverage(source.rawSet, target.rawSet);
  const transformed = computeTransformCoverage(source, target);

  return {
    sourceCoverage: Number(raw.sourceCoverage.toFixed(4)),
    targetCoverage: Number(raw.targetCoverage.toFixed(4)),
    transformedCoverage: Number(transformed.maxCoverage.toFixed(4)),
    semanticScore: Number((jaccard(source.semanticTokenSet, target.semanticTokenSet) * 100).toFixed(2))
  };
}

function quickCandidateScore(source: ProfiledColumn, target: ProfiledColumn, headerTrust: HeaderTrustLevel): QuickCandidate {
  const typeScore = compareColumnTypes(source.observedType, target.observedType).score;
  const sampleOverlap = coverage(source.sampleSet, target.sampleSet).sourceCoverage;
  const transformHint = computeTransformCoverage(source, target).maxCoverage;
  const headerScore = compareHeaders(source.column, target.column).score;
  const headerWeight = headerTrust === "low" ? 0.03 : headerTrust === "medium" ? 0.12 : 0.2;

  return {
    targetId: target.column.id,
    quickScore: sampleOverlap * 50 + transformHint * 28 + (typeScore / 100) * 20 + (headerScore / 100) * (headerWeight * 100),
    typeScore,
    sampleOverlap,
    transformHint
  };
}

function businessPlausibility(source: ProfiledColumn, target: ProfiledColumn, headerTrust: HeaderTrustLevel): number {
  const typeScore = compareColumnTypes(source.observedType, target.observedType).score;
  const sourceAlignment = headerBusinessAlignmentScore(source.column.originalName, source.observedType);
  const targetAlignment = headerBusinessAlignmentScore(target.column.originalName, target.observedType);
  const headerScore = compareHeaders(source.column, target.column).score;
  const headerFactor = headerTrust === "low" ? 0.2 : headerTrust === "medium" ? 0.55 : 1;

  return Math.round(typeScore * 0.55 + ((sourceAlignment + targetAlignment) / 2) * 0.35 + headerScore * 0.1 * headerFactor);
}

function buildCandidate(source: ProfiledColumn, target: ProfiledColumn, headerTrust: HeaderTrustLevel, isDuplicateTarget: boolean): MatchCandidate {
  const valueEvidence = buildValueEvidence(source, target);
  const overlap = buildOverlapMetrics(source, target);
  const typeScore = compareColumnTypes(source.observedType, target.observedType).score;
  const headerScore = compareHeaders(source.column, target.column).score;
  const plausibility = businessPlausibility(source, target, headerTrust);

  let confidence =
    overlap.sourceCoverage * 48 +
    overlap.targetCoverage * 20 +
    overlap.transformedCoverage * 18 +
    (overlap.semanticScore / 100) * 14 +
    (typeScore / 100) * 16 +
    (plausibility / 100) * 16;

  if (isDuplicateTarget) confidence -= 45;
  if (valueEvidence.lowCardinalityRisk) confidence -= 12;
  if (plausibility < 45) confidence -= 15;

  const bounded = Math.max(0, Math.min(100, Math.round(confidence)));
  const reason: string[] = [];

  if (overlap.sourceCoverage >= EXACT_SOURCE_COVERAGE_STRONG && overlap.targetCoverage >= EXACT_TARGET_COVERAGE_STRONG) {
    reason.push("High unique-set overlap supports same business field");
  }
  if (overlap.transformedCoverage >= TRANSFORMED_COVERAGE_ACCEPT) {
    reason.push("Transformed signatures strongly overlap");
  }
  if (overlap.semanticScore >= 75) {
    reason.push("Semantic token overlap indicates related business meaning");
  }
  if (isDuplicateTarget) {
    reason.push("Target is in duplicate cluster and receives heavy penalty");
  }
  if (plausibility < 45) {
    reason.push("Business plausibility is weak for this candidate");
  }
  if (valueEvidence.lowCardinalityRisk) {
    reason.push("Low-cardinality repetition risk detected");
  }
  if (!reason.length) {
    reason.push("Evidence remains limited");
  }

  return {
    sourceColumnId: source.column.id,
    sourceColumnName: source.column.originalName,
    targetColumnId: target.column.id,
    targetColumnName: target.column.originalName,
    sourceType: source.observedType,
    targetType: target.observedType,
    confidence: bounded,
    status: bounded >= correlationConfig.strongThreshold ? "matched" : bounded >= correlationConfig.weakThreshold ? "weak" : "unmatched",
    reason,
    scores: {
      headerScore,
      valueScore: Math.round((overlap.sourceCoverage * 70 + overlap.targetCoverage * 30) * 100),
      typeScore,
      metadataScore: Math.round((1 - Math.abs(source.nullRatio - target.nullRatio)) * 100),
      totalScore: bounded
    },
    evidence: {
      exact: Math.round(((overlap.sourceCoverage + overlap.targetCoverage) / 2) * 100),
      transformed: Math.round(overlap.transformedCoverage * 100),
      semantic: Math.round(overlap.semanticScore)
    }
  };
}

function decideCandidate(
  candidate: MatchCandidate,
  source: ProfiledColumn,
  target: ProfiledColumn,
  overlap: OverlapMetrics,
  valueEvidence: ValueEvidence,
  headerTrust: HeaderTrustLevel,
  shiftSuspected: boolean,
  canonicalByTarget: Record<string, string>,
  canonicalBySource: Record<string, string>
): {
  category: Exclude<MappingCategory, "derived">;
  decision:
    | "ACCEPT_EXACT"
    | "ACCEPT_EXACT_PARTIAL"
    | "ACCEPT_STRONG_DOMAIN_MATCH"
    | "ACCEPT_TRANSFORMED"
    | "ACCEPT_SEMANTIC"
    | "REJECT_SHIFTED_HEADER"
    | "REJECT_DUPLICATE"
    | "REJECT_WEAK"
    | "UNMATCHED";
  rejectionReason?: string;
} {
  const sourceCanonical = canonicalBySource[source.column.id] ?? source.column.id;
  if (sourceCanonical !== source.column.id && target.observedType === "amount") {
    return {
      category: "unmatched",
      decision: "REJECT_DUPLICATE",
      rejectionReason: "Source column is duplicate/suspicious and not the canonical amount representative"
    };
  }

  const canonical = canonicalByTarget[candidate.targetColumnId] ?? candidate.targetColumnId;
  if (canonical !== candidate.targetColumnId) {
    return {
      category: "unmatched",
      decision: "REJECT_DUPLICATE",
      rejectionReason: "Duplicate target column rejected; canonical target retained"
    };
  }

  const typeScore = compareColumnTypes(source.observedType, target.observedType).score;
  const transforms = computeTransformCoverage(source, target);
  const plausibility = businessPlausibility(source, target, headerTrust);

  if (
    isDateLike(source.observedType) &&
    isDateLike(target.observedType) &&
    /tran[_\s-]?date|value[_\s-]?date/i.test(target.column.originalName)
  ) {
    return {
      category: "unmatched",
      decision: "REJECT_WEAK",
      rejectionReason: "Target date column is treated as derived date-part mapping"
    };
  }

  if (typeScore < 45 && overlap.sourceCoverage > 0.7) {
    return {
      category: "unmatched",
      decision: shiftSuspected ? "REJECT_SHIFTED_HEADER" : "REJECT_WEAK",
      rejectionReason: "Raw overlap is high but observed business types are incompatible"
    };
  }

  if ((headerTrust === "low" || shiftSuspected) && overlap.sourceCoverage > 0.72 && plausibility < 50) {
    return {
      category: "unmatched",
      decision: "REJECT_SHIFTED_HEADER",
      rejectionReason: "Shifted/misleading header likely; rejected despite overlap"
    };
  }

  const amountLikeExact =
    (source.observedType === "amount" || source.observedType === "generic_numeric") &&
    (target.observedType === "amount" || target.observedType === "generic_numeric") &&
    coverage(source.amountSet, target.amountSet).sourceCoverage >= 0.94 &&
    coverage(source.amountSet, target.amountSet).targetCoverage >= 0.94;

  if (amountLikeExact && plausibility >= 55 && !valueEvidence.lowCardinalityRisk) {
    return { category: "exact", decision: "ACCEPT_EXACT" };
  }

  const strongExact =
    overlap.sourceCoverage >= EXACT_SOURCE_COVERAGE_STRONG &&
    overlap.targetCoverage >= EXACT_TARGET_COVERAGE_STRONG &&
    typeScore >= 60 &&
    plausibility >= 55 &&
    !valueEvidence.lowCardinalityRisk;

  if (strongExact) {
    return { category: "exact", decision: "ACCEPT_EXACT" };
  }

  const partialExact =
    overlap.sourceCoverage >= EXACT_SOURCE_COVERAGE_PARTIAL &&
    overlap.targetCoverage >= EXACT_TARGET_COVERAGE_PARTIAL &&
    typeScore >= 55 &&
    plausibility >= 52 &&
    !valueEvidence.lowCardinalityRisk;

  if (partialExact) {
    return { category: "exact", decision: "ACCEPT_EXACT_PARTIAL" };
  }

  const strongDateDomain = isDateLike(source.observedType) && isDateLike(target.observedType) && transforms.dateCoverage >= 0.82;
  const strongDomainMatch =
    strongDateDomain ||
    (overlap.sourceCoverage >= 0.6 && overlap.targetCoverage >= 0.5 && typeScore >= 68 && compareHeaders(source.column, target.column).score >= 30 && plausibility >= 55);

  if (strongDomainMatch) {
    return { category: "exact", decision: "ACCEPT_STRONG_DOMAIN_MATCH" };
  }

  const panTransformed =
    transforms.panCoverageSource >= 0.85 &&
    transforms.panCoverageTarget >= 0.85 &&
    (source.observedType === "card_number" ||
      source.observedType === "masked_pan" ||
      source.observedType === "datetime" ||
      target.observedType === "card_number" ||
      target.observedType === "masked_pan");
  const genericTransformed = transforms.maxCoverage >= TRANSFORMED_COVERAGE_ACCEPT && typeScore >= 55;
  if (panTransformed || genericTransformed) {
    return { category: "transformed", decision: "ACCEPT_TRANSFORMED" };
  }

  if (isTextLike(source.observedType) && isTextLike(target.observedType) && overlap.semanticScore / 100 >= SEMANTIC_ACCEPT) {
    return { category: "semantic", decision: "ACCEPT_SEMANTIC" };
  }

  if (candidate.confidence < correlationConfig.weakThreshold) {
    return { category: "unmatched", decision: "UNMATCHED", rejectionReason: "No reliable evidence found" };
  }

  return { category: "unmatched", decision: "REJECT_WEAK", rejectionReason: "Evidence too weak for conservative acceptance" };
}

function makeFinalizedMatch(
  source: ProfiledColumn,
  target: ProfiledColumn,
  candidate: MatchCandidate,
  headerTrust: HeaderTrustLevel,
  decision: "ACCEPT_EXACT" | "ACCEPT_EXACT_PARTIAL" | "ACCEPT_STRONG_DOMAIN_MATCH" | "ACCEPT_TRANSFORMED" | "ACCEPT_SEMANTIC",
  category: "exact" | "transformed" | "semantic"
): FinalizedMatch {
  const overlap = buildOverlapMetrics(source, target);
  const overlapScore = Number((((overlap.sourceCoverage + overlap.targetCoverage) / 2) * 100).toFixed(2));
  return {
    sourceColumnId: source.column.id,
    sourceColumnName: source.column.originalName,
    sourceColumn: source.column.originalName,
    targetColumnId: target.column.id,
    targetColumnName: target.column.originalName,
    targetColumn: target.column.originalName,
    decision,
    finalMappingDecision: decision,
    category,
    confidence: candidate.confidence,
    sourceObservedType: source.observedType,
    targetObservedType: target.observedType,
    headerTrust,
    headerTrustLevel: headerTrust,
    sourceCoverage: overlap.sourceCoverage,
    targetCoverage: overlap.targetCoverage,
    overlapScore,
    transformedScore: Number((overlap.transformedCoverage * 100).toFixed(2)),
    semanticScore: overlap.semanticScore,
    duplicatePenalty: 0,
    overlapMetrics: overlap,
    valueEvidence: buildValueEvidence(source, target),
    reason: candidate.reason
  };
}

function summaryFromBuckets(
  totalSourceColumns: number,
  exactMatches: FinalizedMatch[],
  exactPartialMatches: FinalizedMatch[],
  strongDomainMatches: FinalizedMatch[],
  transformedMatches: FinalizedMatch[],
  semanticMatches: FinalizedMatch[],
  derivedMatches: DerivedMatch[],
  duplicateOrSuspicious: RejectedMatch[],
  unmatched: UnmatchedColumn[]
): CorrelationSummary {
  return {
    totalSourceColumns,
    exact: exactMatches.length,
    exactPartial: exactPartialMatches.length,
    strongDomain: strongDomainMatches.length,
    transformed: transformedMatches.length,
    semantic: semanticMatches.length,
    derived: derivedMatches.length,
    duplicateOrSuspicious: duplicateOrSuspicious.length,
    unmatched: unmatched.length
  };
}

function addDerivedDateMatches(
  sourceProfiles: ProfiledColumn[],
  targetProfiles: ProfiledColumn[],
  acceptedTargetIdsBySource: Map<string, Set<string>>,
  sourceHeaderTrust: Record<string, HeaderTrustLevel>
): DerivedMatch[] {
  const derived: DerivedMatch[] = [];

  sourceProfiles.forEach((source) => {
    if (!isDateLike(source.observedType)) return;
    const acceptedTargets = acceptedTargetIdsBySource.get(source.column.id) ?? new Set<string>();
    const headerTrust = sourceHeaderTrust[source.column.id] ?? "medium";

    targetProfiles.forEach((target) => {
      if (!isDateLike(target.observedType)) return;
      if (acceptedTargets.has(target.column.id) && !/tran[_\s-]?date|value[_\s-]?date/i.test(target.column.originalName)) return;

      const dateCoverage = coverage(source.dateSet, target.dateSet);
      if (dateCoverage.sourceCoverage < 0.78) return;

      const overlapMetrics = buildOverlapMetrics(source, target);
      const overlapScore = Number((((overlapMetrics.sourceCoverage + overlapMetrics.targetCoverage) / 2) * 100).toFixed(2));
      const valueEvidence = buildValueEvidence(source, target);
      derived.push({
        sourceColumnId: source.column.id,
        sourceColumnName: source.column.originalName,
        sourceColumn: `${source.column.originalName}(date part)`,
        targetColumnId: target.column.id,
        targetColumnName: target.column.originalName,
        targetColumn: target.column.originalName,
        category: "derived",
        decision: "DERIVED_MATCH",
        finalMappingDecision: "DERIVED_MATCH",
        confidence: Math.round(dateCoverage.sourceCoverage * 100),
        sourceObservedType: source.observedType,
        targetObservedType: target.observedType,
        headerTrust,
        headerTrustLevel: headerTrust,
        sourceCoverage: overlapMetrics.sourceCoverage,
        targetCoverage: overlapMetrics.targetCoverage,
        overlapScore,
        transformedScore: Number((overlapMetrics.transformedCoverage * 100).toFixed(2)),
        semanticScore: overlapMetrics.semanticScore,
        duplicatePenalty: 0,
        overlapMetrics,
        valueEvidence,
        reason: ["Date component can be derived from source datetime/date values"],
        derivationRule: "DATE_PART"
      });
    });
  });

  return derived;
}

export function buildCorrelationMatrix(fileA: ParsedFile, fileB: ParsedFile): CorrelationResponse {
  const sourceProfiles = fileA.columns.map((column) => buildProfile(column));
  const targetProfiles = fileB.columns.map((column) => buildProfile(column));
  const acceptedTargetIdsBySource = new Map<string, Set<string>>();
  // Use plain objects/arrays only for all lookups
  const targetById: Record<string, ProfiledColumn> = {};
  targetProfiles.forEach((item) => { targetById[item.column.id] = item; });

  const sourceSchema = schemaSanityCheck(fileA, sourceProfiles);
  const targetSchema = schemaSanityCheck(fileB, targetProfiles);
  const schemaWarnings: SchemaWarning[] = [...sourceSchema.warnings, ...targetSchema.warnings];

  const { canonicalByColumnId, duplicates } = detectDuplicateTargets(targetProfiles);
  const { canonicalByColumnId: sourceCanonicalByColumnId, duplicates: sourceDuplicates } = detectDuplicateSources(sourceProfiles);

  const exactMatches: FinalizedMatch[] = [];
  const exactPartialMatches: FinalizedMatch[] = [];
  const strongDomainMatches: FinalizedMatch[] = [];
  const transformedMatches: FinalizedMatch[] = [];
  const semanticMatches: FinalizedMatch[] = [];
  const derivedMatches: DerivedMatch[] = [];
  const rejectedMatches: RejectedMatch[] = [];
  const duplicateOrSuspicious: RejectedMatch[] = [];
  const unmatched: UnmatchedColumn[] = [];
  // acceptedTargetIdsBySource is only used internally, do not include in response

  const results: CorrelationResultItem[] = sourceProfiles.map((source) => {
    const headerTrust = sourceSchema.trustByColumnId[source.column.id] ?? "medium";

    const shortlist = targetProfiles
      .map((target) => quickCandidateScore(source, target, headerTrust))
      .filter((quick) => !(quick.typeScore < 30 && quick.sampleOverlap < 0.12 && quick.transformHint < 0.2))
      .sort((a, b) => b.quickScore - a.quickScore)
      .slice(0, SHORTLIST_LIMIT);

    const deepCandidates = shortlist
      .map((quick) => {
        const target = targetById[quick.targetId];
        if (!target) return null;
        const isDuplicateTarget = (canonicalByColumnId[target.column.id] ?? target.column.id) !== target.column.id;
        return buildCandidate(source, target, headerTrust, isDuplicateTarget);
      })
      .filter((candidate): candidate is MatchCandidate => candidate !== null)
      .sort((a, b) => b.confidence - a.confidence);

    const acceptedCandidates: Array<{
      candidate: MatchCandidate;
      target: ProfiledColumn;
      decision: "ACCEPT_EXACT" | "ACCEPT_EXACT_PARTIAL" | "ACCEPT_STRONG_DOMAIN_MATCH" | "ACCEPT_TRANSFORMED" | "ACCEPT_SEMANTIC";
      category: "exact" | "transformed" | "semantic";
    }> = [];

    for (const candidate of deepCandidates) {
      const target = targetById[candidate.targetColumnId];
      if (!target) continue;

      const overlap = buildOverlapMetrics(source, target);
      const evidence = buildValueEvidence(source, target);
      const decision = decideCandidate(
        candidate,
        source,
        target,
        overlap,
        evidence,
        headerTrust,
        sourceSchema.shiftSuspected || targetSchema.shiftSuspected,
        canonicalByColumnId,
        sourceCanonicalByColumnId
      );

      if (
        decision.decision === "ACCEPT_EXACT" ||
        decision.decision === "ACCEPT_EXACT_PARTIAL" ||
        decision.decision === "ACCEPT_STRONG_DOMAIN_MATCH" ||
        decision.decision === "ACCEPT_TRANSFORMED" ||
        decision.decision === "ACCEPT_SEMANTIC"
      ) {
        acceptedCandidates.push({
          candidate,
          target,
          decision: decision.decision,
          category: decision.category as "exact" | "transformed" | "semantic"
        });
        continue;
      }

      const rejected: RejectedMatch = {
        sourceColumnId: source.column.id,
        sourceColumnName: source.column.originalName,
        sourceColumn: source.column.originalName,
        targetColumnId: target.column.id,
        targetColumnName: target.column.originalName,
        targetColumn: target.column.originalName,
        category: decision.decision === "REJECT_DUPLICATE" ? "duplicate_or_suspicious" : "rejected",
        decision:
          decision.decision === "REJECT_SHIFTED_HEADER"
            ? "REJECT_SHIFTED_HEADER"
            : decision.decision === "REJECT_DUPLICATE"
              ? "REJECT_DUPLICATE"
              : "REJECT_WEAK",
        confidence: candidate.confidence,
        sourceObservedType: source.observedType,
        targetObservedType: target.observedType,
        headerTrust,
        headerTrustLevel: headerTrust,
        sourceCoverage: overlap.sourceCoverage,
        targetCoverage: overlap.targetCoverage,
        overlapScore: Number((((overlap.sourceCoverage + overlap.targetCoverage) / 2) * 100).toFixed(2)),
        transformedScore: Number((overlap.transformedCoverage * 100).toFixed(2)),
        semanticScore: overlap.semanticScore,
        duplicatePenalty: decision.decision === "REJECT_DUPLICATE" ? 100 : 0,
        overlapMetrics: overlap,
        valueEvidence: evidence,
        reason: candidate.reason,
        rejectionReason: decision.rejectionReason ?? "Rejected"
      };

      rejectedMatches.push(rejected);
      if (rejected.decision === "REJECT_DUPLICATE") {
        duplicateOrSuspicious.push(rejected);
      }
    }

    acceptedCandidates.forEach((entry) => {
      const finalized = makeFinalizedMatch(source, entry.target, entry.candidate, headerTrust, entry.decision, entry.category);

      if (entry.category === "exact") {
        if (entry.decision === "ACCEPT_EXACT") {
          exactMatches.push(finalized);
        } else if (entry.decision === "ACCEPT_EXACT_PARTIAL") {
          exactPartialMatches.push(finalized);
        } else {
          strongDomainMatches.push(finalized);
        }
      } else if (entry.category === "transformed") {
        transformedMatches.push(finalized);
      } else {
        semanticMatches.push(finalized);
      }
    });

    if (acceptedCandidates.length > 0) {
      acceptedTargetIdsBySource.set(source.column.id, new Set(acceptedCandidates.map((item) => item.target.column.id)));
    }

    const bestAccepted = [...acceptedCandidates].sort((a, b) => b.candidate.confidence - a.candidate.confidence)[0];
    if (!bestAccepted) {
      const defaultOverlap: OverlapMetrics = {
        sourceCoverage: 0,
        targetCoverage: 0,
        transformedCoverage: 0,
        semanticScore: 0
      };
      unmatched.push({
        sourceColumnId: source.column.id,
        sourceColumnName: source.column.originalName,
        sourceColumn: source.column.originalName,
        targetColumnId: null,
        targetColumnName: null,
        targetColumn: null,
        category: "unmatched",
        decision: "UNMATCHED",
        confidence: 0,
        sourceObservedType: source.observedType,
        targetObservedType: "unknown",
        headerTrust,
        sourceCoverage: 0,
        targetCoverage: 0,
        overlapScore: 0,
        transformedScore: 0,
        semanticScore: 0,
        duplicatePenalty: 0,
        overlapMetrics: defaultOverlap,
        rejectionReason: "No accepted correlation found after strict validation",
        finalMappingDecision: "UNMATCHED",
        reason: ["No accepted correlation found after strict validation"]
      });

      return {
        sourceColumnId: source.column.id,
        sourceColumnName: source.column.originalName,
        sourceType: source.inferredType,
        sourceObservedType: source.observedType,
        headerTrustLevel: headerTrust,
        bestMatch: null,
        alternatives: deepCandidates.slice(0, 3),
        mappingCategory: "unmatched",
        finalMappingDecision: "UNMATCHED",
        finalReason: ["No accepted correlation found after strict validation"]
      };
    }

    return {
      sourceColumnId: source.column.id,
      sourceColumnName: source.column.originalName,
      sourceType: source.inferredType,
      sourceObservedType: source.observedType,
      headerTrustLevel: headerTrust,
      bestMatch: bestAccepted.candidate,
      alternatives: deepCandidates.filter((candidate) => candidate.targetColumnId !== bestAccepted.candidate.targetColumnId).slice(0, 3),
      mappingCategory: bestAccepted.category,
      finalMappingDecision: bestAccepted.decision,
      finalReason: bestAccepted.candidate.reason
    };
  });

  derivedMatches.push(...addDerivedDateMatches(sourceProfiles, targetProfiles, acceptedTargetIdsBySource, sourceSchema.trustByColumnId));

  sourceDuplicates.forEach((duplicate) => {
    const profile = sourceProfiles.find((item) => item.column.id === duplicate.columnId);
    if (!profile) return;
    if (unmatched.some((item) => item.sourceColumnId === duplicate.columnId)) return;

    unmatched.push({
      sourceColumnId: profile.column.id,
      sourceColumnName: profile.column.originalName,
      sourceColumn: profile.column.originalName,
      targetColumnId: null,
      targetColumnName: null,
      targetColumn: null,
      category: "unmatched",
      decision: "REJECT_DUPLICATE",
      confidence: 0,
      sourceObservedType: profile.observedType,
      targetObservedType: "unknown",
      headerTrust: sourceSchema.trustByColumnId[profile.column.id] ?? "medium",
      sourceCoverage: 0,
      targetCoverage: 0,
      overlapScore: 0,
      transformedScore: 0,
      semanticScore: 0,
      duplicatePenalty: 100,
      overlapMetrics: {
        sourceCoverage: 0,
        targetCoverage: 0,
        transformedCoverage: 0,
        semanticScore: 0
      },
      rejectionReason: duplicate.reason,
      finalMappingDecision: "REJECT_DUPLICATE",
      reason: [duplicate.reason]
    });
  });

  // Use plain objects for lookups, not Maps
  const sourceById: Record<string, any> = {};
  sourceProfiles.forEach((profile) => { sourceById[profile.column.id] = profile; });
  const targetProfileById: Record<string, any> = {};
  targetProfiles.forEach((profile) => { targetProfileById[profile.column.id] = profile; });
  const acceptedAll = [...exactMatches, ...exactPartialMatches, ...strongDomainMatches, ...transformedMatches, ...semanticMatches];
  // Use plain object for acceptedByTarget
  const acceptedByTarget: Record<string, FinalizedMatch[]> = {};
  acceptedAll.forEach((item) => {
    if (!acceptedByTarget[item.targetColumnId]) {
      acceptedByTarget[item.targetColumnId] = [];
    }
    acceptedByTarget[item.targetColumnId].push(item);
  });

  Object.entries(acceptedByTarget).forEach(([targetId, group]) => {
    if (group.length <= 1) return;

    const ranked = [...group].sort((a, b) => {
      const aSource = sourceById[a.sourceColumnId];
      const bSource = sourceById[b.sourceColumnId];
      const aAlignment = aSource ? headerBusinessAlignmentScore(aSource.column.originalName, aSource.observedType) : 0;
      const bAlignment = bSource ? headerBusinessAlignmentScore(bSource.column.originalName, bSource.observedType) : 0;
      const aScore = a.confidence + aAlignment * 0.4;
      const bScore = b.confidence + bAlignment * 0.4;
      return bScore - aScore;
    });

    const winner = ranked[0];
    const losers = ranked.slice(1);
    if (!losers.length) return;

    const removeByIdentity = (arr: FinalizedMatch[]) => {
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        if (arr[i].targetColumnId === targetId && arr[i].sourceColumnId !== winner.sourceColumnId) {
          arr.splice(i, 1);
        }
      }
    };

    removeByIdentity(exactMatches);
    removeByIdentity(exactPartialMatches);
    removeByIdentity(strongDomainMatches);
    removeByIdentity(transformedMatches);
    removeByIdentity(semanticMatches);

    losers.forEach((loser) => {
      const source = sourceById[loser.sourceColumnId];
      const target = targetProfileById[targetId];
      if (!source || !target) return;

      const overlap = buildOverlapMetrics(source, target);
      const evidence = buildValueEvidence(source, target);
      const rejectionReason = `Weaker duplicate candidate for ${target.column.originalName}; ${winner.sourceColumnName} is the stronger business mapping`;

      const rejected: RejectedMatch = {
        sourceColumnId: source.column.id,
        sourceColumnName: source.column.originalName,
        sourceColumn: source.column.originalName,
        targetColumnId: target.column.id,
        targetColumnName: target.column.originalName,
        targetColumn: target.column.originalName,
        category: "duplicate_or_suspicious",
        decision: "REJECT_DUPLICATE",
        confidence: loser.confidence,
        sourceObservedType: source.observedType,
        targetObservedType: target.observedType,
        headerTrust: loser.headerTrustLevel,
        headerTrustLevel: loser.headerTrustLevel,
        sourceCoverage: overlap.sourceCoverage,
        targetCoverage: overlap.targetCoverage,
        overlapScore: Number((((overlap.sourceCoverage + overlap.targetCoverage) / 2) * 100).toFixed(2)),
        transformedScore: Number((overlap.transformedCoverage * 100).toFixed(2)),
        semanticScore: overlap.semanticScore,
        duplicatePenalty: 100,
        overlapMetrics: overlap,
        valueEvidence: evidence,
        reason: loser.reason,
        rejectionReason
      };

      rejectedMatches.push(rejected);
      duplicateOrSuspicious.push(rejected);

      const mapped = results.find((result) => result.sourceColumnId === source.column.id);
      if (!mapped) return;

      if (mapped.bestMatch?.targetColumnId === target.column.id) {
        mapped.bestMatch = null;
        mapped.mappingCategory = "unmatched";
        mapped.finalMappingDecision = "REJECT_DUPLICATE";
        mapped.finalReason = [rejectionReason];
      }

      const stillAccepted =
        exactMatches.some((item) => item.sourceColumnId === source.column.id) ||
        exactPartialMatches.some((item) => item.sourceColumnId === source.column.id) ||
        strongDomainMatches.some((item) => item.sourceColumnId === source.column.id) ||
        transformedMatches.some((item) => item.sourceColumnId === source.column.id) ||
        semanticMatches.some((item) => item.sourceColumnId === source.column.id);

      if (!stillAccepted && !unmatched.some((item) => item.sourceColumnId === source.column.id)) {
        unmatched.push({
          sourceColumnId: source.column.id,
          sourceColumnName: source.column.originalName,
          sourceColumn: source.column.originalName,
          targetColumnId: null,
          targetColumnName: null,
          targetColumn: null,
          category: "unmatched",
          decision: "REJECT_DUPLICATE",
          confidence: loser.confidence,
          sourceObservedType: source.observedType,
          targetObservedType: "unknown",
          headerTrust: loser.headerTrustLevel,
          sourceCoverage: 0,
          targetCoverage: 0,
          overlapScore: 0,
          transformedScore: 0,
          semanticScore: 0,
          duplicatePenalty: 100,
          overlapMetrics: {
            sourceCoverage: 0,
            targetCoverage: 0,
            transformedCoverage: 0,
            semanticScore: 0
          },
          rejectionReason,
          finalMappingDecision: "REJECT_DUPLICATE",
          reason: [rejectionReason]
        });
      }
    });
  });

  const reverseCheck: ReverseCheckItem[] = targetProfiles.map((target) => {
    const options = results
      .map((result) => result.bestMatch)
      .filter((candidate): candidate is MatchCandidate => candidate !== null && candidate.targetColumnId === target.column.id)
      .sort((a, b) => b.confidence - a.confidence);

    const best = options[0];
    return {
      targetColumnId: target.column.id,
      targetColumnName: target.column.originalName,
      bestSourceColumnId: best?.sourceColumnId ?? null,
      bestSourceColumnName: best?.sourceColumnName ?? null,
      confidence: best?.confidence ?? 0,
      status: best?.status ?? "unmatched"
    };
  });

  return {
    fileA: {
      name: fileA.name,
      columns: fileA.columns,
      sheetName: fileA.sheetName
    },
    fileB: {
      name: fileB.name,
      columns: fileB.columns,
      sheetName: fileB.sheetName
    },
    exactMatches,
    exactPartialMatches,
    strongDomainMatches,
    transformedMatches,
    semanticMatches,
    derivedMatches,
    duplicateOrSuspicious,
    unmatched,
    rejectedMatches,
    duplicateOrSuspiciousColumns: [...duplicates, ...sourceDuplicates],
    schemaWarnings,
    results,
    reverseCheck,
    summary: summaryFromBuckets(
      sourceProfiles.length,
      exactMatches,
      exactPartialMatches,
      strongDomainMatches,
      transformedMatches,
      semanticMatches,
      derivedMatches,
      duplicateOrSuspicious,
      unmatched
    )
    // All Maps/Sets are now removed from the response
  };
}
