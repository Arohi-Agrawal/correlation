import { CorrelationResultItem } from "@/lib/types";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

type StatusFilter = "accepted" | "all" | "exact" | "transformed" | "semantic" | "unmatched";

interface ResultsTableProps {
  results: CorrelationResultItem[];
  targetColumns: Array<{ id: string; name: string }>;
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  overrides: Record<string, string | null>;
  feedback: Record<string, "correct" | "incorrect" | "pending">;
  onOverride: (sourceColumnId: string, targetColumnId: string | null) => void;
  onFeedback: (sourceColumnId: string, verdict: "correct" | "incorrect") => void;
  onInspectCandidates: (result: CorrelationResultItem) => void;
}

function effectiveTargetName(
  result: CorrelationResultItem,
  overrides: Record<string, string | null>,
  targetColumns: Array<{ id: string; name: string }>
): string {
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, result.sourceColumnId);
  const override = overrides[result.sourceColumnId];
  if (hasOverride && override === null) return "Unmatched (manual)";
  if (hasOverride && override) {
    return targetColumns.find((col) => col.id === override)?.name ?? override;
  }
  return result.bestMatch?.targetColumnName ?? "-";
}

function overrideValue(result: CorrelationResultItem, overrides: Record<string, string | null>): string {
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, result.sourceColumnId);
  if (!hasOverride) {
    return "";
  }
  const value = overrides[result.sourceColumnId];
  return value === null ? "__NULL__" : value;
}

export function ResultsTable({
  results,
  targetColumns,
  filter,
  onFilterChange,
  overrides,
  feedback,
  onOverride,
  onFeedback,
  onInspectCandidates
}: ResultsTableProps) {
  const filtered = results.filter((result) => {
    if (filter === "all") return true;
    if (filter === "accepted") {
      return result.mappingCategory === "exact" || result.mappingCategory === "transformed" || result.mappingCategory === "semantic";
    }
    if (filter === "unmatched") {
      return result.mappingCategory === "unmatched";
    }
    return result.mappingCategory === filter;
  });

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h3 className="section-title">Correlation Results</h3>
        <select
          className="rounded border border-slate-300 bg-white px-3 py-2 text-xs"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value as StatusFilter)}
        >
          <option value="accepted">Accepted Only</option>
          <option value="all">All</option>
          <option value="exact">Exact</option>
          <option value="transformed">Transformed</option>
          <option value="semantic">Semantic</option>
          <option value="unmatched">Unmatched</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              <th>File A Column</th>
              <th>Best File B Match</th>
              <th>Category</th>
              <th>Decision</th>
              <th>Confidence</th>
              <th>Type A</th>
              <th>Type B</th>
              <th>Header</th>
              <th>Value</th>
              <th>Total</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-4 text-xs text-slate-500">
                  No rows for selected filter.
                </td>
              </tr>
            )}
            {filtered.map((result) => {
              const best = result.bestMatch;
              const verdict = feedback[result.sourceColumnId] ?? "pending";

              return (
                <tr key={result.sourceColumnId}>
                  <td>
                    <div className="font-semibold">{result.sourceColumnName}</div>
                    <div className="text-[11px] text-slate-500">{result.sourceColumnId}</div>
                  </td>
                  <td>
                    <div>{effectiveTargetName(result, overrides, targetColumns)}</div>
                    <button
                      className="mt-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
                      onClick={() => onInspectCandidates(result)}
                    >
                      Top 3 candidates
                    </button>
                    <div className="mt-2">
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-[11px]"
                        value={overrideValue(result, overrides)}
                        onChange={(event) => onOverride(result.sourceColumnId, event.target.value || null)}
                      >
                        <option value="">No override</option>
                        <option value="__NULL__">Force unmatched</option>
                        {targetColumns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>{result.mappingCategory}</td>
                  <td>{result.finalMappingDecision}</td>
                  <td>
                    <div className="mb-1 text-sm font-semibold">{best?.confidence ?? 0}</div>
                    <ConfidenceBadge confidence={best?.confidence ?? 0} />
                  </td>
                  <td>{result.sourceType}</td>
                  <td>{best?.targetType ?? "-"}</td>
                  <td>{best?.scores.headerScore ?? 0}</td>
                  <td>{best?.scores.valueScore ?? 0}</td>
                  <td>{best?.scores.totalScore ?? 0}</td>
                  <td>{best?.status ?? "unmatched"}</td>
                  <td className="max-w-xs">
                    <div className="max-h-16 overflow-hidden text-[11px] leading-4">{(best?.reason ?? result.finalReason).join(" | ")}</div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className={`rounded px-2 py-1 text-[11px] ${verdict === "correct" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}
                        onClick={() => onFeedback(result.sourceColumnId, "correct")}
                      >
                        Correct
                      </button>
                      <button
                        className={`rounded px-2 py-1 text-[11px] ${verdict === "incorrect" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}
                        onClick={() => onFeedback(result.sourceColumnId, "incorrect")}
                      >
                        Incorrect
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
