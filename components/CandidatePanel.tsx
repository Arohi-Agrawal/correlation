import { MatchCandidate } from "@/lib/types";

interface CandidatePanelProps {
  open: boolean;
  sourceColumn: string;
  candidates: MatchCandidate[];
  onClose: () => void;
}

export function CandidatePanel({ open, sourceColumn, candidates, onClose }: CandidatePanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/20" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Top candidates for {sourceColumn}</h3>
          <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-3">
          {candidates.length === 0 && <p className="text-xs text-slate-500">No candidates.</p>}
          {candidates.map((candidate) => (
            <article key={candidate.targetColumnId} className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-800">
                {candidate.targetColumnName} ({candidate.targetColumnId})
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Confidence: {candidate.confidence} | Type: {candidate.targetType}
              </div>
              <div className="mt-2 text-xs text-slate-700">
                Header: {candidate.scores.headerScore} | Value: {candidate.scores.valueScore} | Type: {candidate.scores.typeScore}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                {candidate.reason.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
