import { ParsedColumn } from "@/lib/types";
import { headerSynonymGroups, tokenizeHeader } from "@/lib/normalization/header";

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function compareHeaders(source: ParsedColumn, target: ParsedColumn): { score: number; reason: string[] } {
  const reasons: string[] = [];
  const sNorm = source.normalizedName;
  const tNorm = target.normalizedName;

  if (!sNorm || !tNorm) {
    return { score: 0, reason: ["Header missing on one side"] };
  }

  let score = 0;

  if (sNorm === tNorm) {
    score += 60;
    reasons.push("Normalized headers match exactly");
  }

  const sTokens = new Set(tokenizeHeader(source.originalName));
  const tTokens = new Set(tokenizeHeader(target.originalName));
  const tokenOverlap = jaccard(sTokens, tTokens);
  score += tokenOverlap * 25;
  if (tokenOverlap > 0.35) {
    reasons.push("Meaningful header token overlap detected");
  }

  const sSyn = new Set(headerSynonymGroups(sNorm));
  const tSyn = new Set(headerSynonymGroups(tNorm));
  const synOverlap = jaccard(sSyn, tSyn);
  score += synOverlap * 15;
  if (synOverlap > 0) {
    reasons.push("Financial synonym groups overlap");
  }

  return { score: Math.min(100, Math.round(score)), reason: reasons };
}
