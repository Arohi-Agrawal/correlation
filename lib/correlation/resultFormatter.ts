import { CorrelationResponse, CorrelationResultItem, MatchCandidate } from "@/lib/types";

export function buildFinalMappings(results: CorrelationResultItem[]): Array<{
  sourceColumnId: string;
  sourceColumnName: string;
  targetColumnId: string | null;
  targetColumnName: string | null;
  confidence: number;
  status: "matched" | "weak" | "ambiguous" | "unmatched";
}> {
  return results.map((item) => ({
    sourceColumnId: item.sourceColumnId,
    sourceColumnName: item.sourceColumnName,
    targetColumnId: item.bestMatch?.targetColumnId ?? null,
    targetColumnName: item.bestMatch?.targetColumnName ?? null,
    confidence: item.bestMatch?.confidence ?? 0,
    status: item.bestMatch?.status ?? "unmatched"
  }));
}

export function buildExplainabilitySummary(candidate: MatchCandidate | null): string {
  if (!candidate) {
    return "No confident candidate was found.";
  }

  const parts = [
    `Header score ${candidate.scores.headerScore}`,
    `Value score ${candidate.scores.valueScore}`,
    `Type score ${candidate.scores.typeScore}`,
    `Total score ${candidate.scores.totalScore}`
  ];

  return `${parts.join(", ")}. Reasons: ${candidate.reason.join("; ")}`;
}

export function attachExplainability(response: CorrelationResponse): CorrelationResponse & {
  explainability: Record<string, string>;
} {
  const explainability: Record<string, string> = {};
  response.results.forEach((item) => {
    explainability[item.sourceColumnId] = buildExplainabilitySummary(item.bestMatch);
  });

  return {
    ...response,
    explainability
  };
}
