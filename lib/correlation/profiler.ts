import { ParsedColumn } from "@/lib/types";
import { ColumnProfile } from "@/lib/types/correlation";
import { detectColumnType } from "@/lib/correlation/typeDetection";

export function computeNullRatio(values: Array<string | null>): number {
  if (!values.length) {
    return 1;
  }
  return values.filter((v) => v === null).length / values.length;
}

export function computeUniqueness(values: Array<string | null>): number {
  const nonNull = values.filter((v): v is string => v !== null);
  if (!nonNull.length) {
    return 0;
  }

  return new Set(nonNull).size / nonNull.length;
}

export function sampleDistinctValues(values: Array<string | null>, limit = 5): string[] {
  const sampled = new Set<string>();
  for (const value of values) {
    if (value === null) continue;
    sampled.add(value);
    if (sampled.size >= limit) break;
  }
  return Array.from(sampled);
}

export function profileColumn(column: ParsedColumn): ColumnProfile {
  // Build a full-featured ColumnProfile for normalization scoring
  const inferredType = detectColumnType(column);
  const nullRatio = computeNullRatio(column.values);
  const uniquenessRatio = computeUniqueness(column.values);
  const distinctSample = sampleDistinctValues(column.values, 8);
  const patternHints: string[] = [];
  if (uniquenessRatio > 0.9) patternHints.push("mostly_unique");
  if (nullRatio > 0.5) patternHints.push("sparse");
  if (distinctSample.some((value) => /^[-+]?\d+(\.\d+)?$/.test(value))) patternHints.push("contains_numeric");
  if (distinctSample.some((value) => /[A-Za-z]{3,}/.test(value))) patternHints.push("contains_text");

  // Fill in all required fields for the rich ColumnProfile
  const values = column.values;
  const nonNullValues = values.filter((v): v is string => v !== null);
  const sampleValues = nonNullValues.slice(0, 50);
  const normalizedHeader = column.normalizedName || column.originalName;
  const normalizedSampleValues = sampleValues.map(v => v && typeof v === 'string' ? v.trim().toLowerCase() : v);
  const distinctSet = new Set(nonNullValues);
  const distinctRatio = distinctSet.size / (nonNullValues.length || 1);
  const avgLength = nonNullValues.length ? nonNullValues.reduce((a, b) => a + b.length, 0) / nonNullValues.length : 0;
  let minLength = 0;
  let maxLength = 0;
  if (nonNullValues.length) {
    minLength = nonNullValues[0].length;
    maxLength = nonNullValues[0].length;
    for (const value of nonNullValues) {
      const length = value.length;
      if (length < minLength) minLength = length;
      if (length > maxLength) maxLength = length;
    }
  }
  const numericLikeRatio = nonNullValues.length ? nonNullValues.filter(v => /^[-+]?\d+(\.\d+)?$/.test(v)).length / nonNullValues.length : 0;
  const integerLikeRatio = nonNullValues.length ? nonNullValues.filter(v => /^[-+]?\d+$/.test(v)).length / nonNullValues.length : 0;
  const decimalLikeRatio = nonNullValues.length ? nonNullValues.filter(v => /^[-+]?\d*\.\d+$/.test(v)).length / nonNullValues.length : 0;
  const dateLikeRatio = nonNullValues.length ? nonNullValues.filter(v => /\d{2,4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(v)).length / nonNullValues.length : 0;
  const datetimeLikeRatio = nonNullValues.length ? nonNullValues.filter(v => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)).length / nonNullValues.length : 0;
  const textLikeRatio = nonNullValues.length ? nonNullValues.filter(v => /[A-Za-z]{3,}/.test(v)).length / nonNullValues.length : 0;
  const uppercaseRatio = nonNullValues.length ? nonNullValues.filter(v => v === v.toUpperCase()).length / nonNullValues.length : 0;
  const maskedRatio = nonNullValues.length ? nonNullValues.filter(v => /[*xX#]/.test(v)).length / nonNullValues.length : 0;
  const repeatedValueRatio = nonNullValues.length ? (nonNullValues.length - distinctSet.size) / nonNullValues.length : 0;
  const topFrequentValues = Array.from(
    Object.entries(nonNullValues.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {} as Record<string, number>))
  ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v]) => v);
  const uniqueValueSet = Array.from(new Set(nonNullValues));
  const frequencyMap = nonNullValues.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {} as Record<string, number>);
  const transformedSignatures = {} as Record<string, string[]>; // Placeholder, fill as needed
  const observedType = inferredType as any; // For compatibility
  const businessHints: string[] = [];

  return {
    originalHeader: column.originalName,
    normalizedHeader,
    sampleValues,
    normalizedSampleValues,
    nullRatio,
    distinctRatio,
    avgLength,
    minLength,
    maxLength,
    numericLikeRatio,
    integerLikeRatio,
    decimalLikeRatio,
    dateLikeRatio,
    datetimeLikeRatio,
    textLikeRatio,
    uppercaseRatio,
    maskedRatio,
    repeatedValueRatio,
    topFrequentValues,
    uniqueValueSet,
    frequencyMap,
    transformedSignatures,
    observedType,
    businessHints
  };
}
