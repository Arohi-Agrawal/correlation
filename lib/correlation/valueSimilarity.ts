import { ParsedColumn } from "@/lib/types";

function toSet(values: Array<string | null>): Set<string> {
  return new Set(values.filter((v): v is string => v !== null));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const v of a) {
    if (b.has(v)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const v of a) {
    if (b.has(v)) overlap += 1;
  }
  return overlap / Math.min(a.size, b.size);
}

function prefixSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const prefixesA = new Set(Array.from(a).map((v) => v.slice(0, 3)));
  const prefixesB = new Set(Array.from(b).map((v) => v.slice(0, 3)));
  return jaccard(prefixesA, prefixesB);
}

function numericDistributionSimilarity(a: string[], b: string[]): number {
  const parse = (values: string[]) => values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  const na = parse(a);
  const nb = parse(b);
  if (na.length < 5 || nb.length < 5) return 0;

  const mean = (arr: number[]) => arr.reduce((acc, cur) => acc + cur, 0) / arr.length;
  const std = (arr: number[]) => {
    const m = mean(arr);
    const variance = arr.reduce((acc, cur) => acc + (cur - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  const meanDiff = Math.abs(mean(na) - mean(nb));
  const stdDiff = Math.abs(std(na) - std(nb));
  const scale = Math.max(Math.abs(mean(na)), Math.abs(mean(nb)), 1);
  const normalized = 1 - Math.min(1, (meanDiff + stdDiff) / (scale * 2));
  return Math.max(0, normalized);
}

export function compareColumnValues(source: ParsedColumn, target: ParsedColumn): { score: number; reason: string[] } {
  const reasons: string[] = [];
  const sourceSet = toSet(source.values);
  const targetSet = toSet(target.values);

  const exactOverlap = overlapRatio(sourceSet, targetSet);
  const setScore = jaccard(sourceSet, targetSet);
  const prefixScore = prefixSimilarity(sourceSet, targetSet);

  const sourceNonNull = source.values.filter((v): v is string => v !== null);
  const targetNonNull = target.values.filter((v): v is string => v !== null);
  const numericSimilarity = numericDistributionSimilarity(sourceNonNull, targetNonNull);

  let score = exactOverlap * 45 + setScore * 25 + prefixScore * 10 + numericSimilarity * 20;

  if (exactOverlap > 0.8) reasons.push("High normalized value overlap");
  else if (exactOverlap > 0.45) reasons.push("Partial value overlap found");

  if (numericSimilarity > 0.65) reasons.push("Numeric distribution appears aligned");
  if (prefixScore > 0.5) reasons.push("Common value prefix/suffix patterns detected");

  if (sourceSet.size < 5 || targetSet.size < 5) {
    score *= 0.85;
    reasons.push("Low distinct value volume; confidence reduced");
  }

  return { score: Math.min(100, Math.round(score)), reason: reasons };
}
