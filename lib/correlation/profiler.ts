import { ColumnProfile, ParsedColumn } from "@/lib/types";
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
  const inferredType = detectColumnType(column);
  const nullRatio = computeNullRatio(column.values);
  const uniquenessRatio = computeUniqueness(column.values);
  const distinctSample = sampleDistinctValues(column.values, 8);

  const patternHints: string[] = [];
  if (uniquenessRatio > 0.9) patternHints.push("mostly_unique");
  if (nullRatio > 0.5) patternHints.push("sparse");
  if (distinctSample.some((value) => /^[-+]?\d+(\.\d+)?$/.test(value))) patternHints.push("contains_numeric");
  if (distinctSample.some((value) => /[A-Za-z]{3,}/.test(value))) patternHints.push("contains_text");

  return {
    columnId: column.id,
    inferredType,
    nullRatio,
    uniquenessRatio,
    distinctSample,
    patternHints
  };
}
