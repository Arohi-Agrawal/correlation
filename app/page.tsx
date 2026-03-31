
"use client";
import { profileColumn } from "@/lib/correlation/profiler";
import { computeNormalizationScore } from "@/lib/normalization/normalizationScore";

function NormalizationStatusList({ columns, fileLabel }: { columns: any[]; fileLabel: string }) {
  return (
    <section className="p-3 bg-slate-50 border border-slate-200 rounded">
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{fileLabel} Columns & Normalization</h4>
      <ul className="list-disc ml-5 text-xs">
        {columns.map((col, idx) => {
          const profile = profileColumn(col);
          let normalizationLevel = "none";
          try {
            normalizationLevel = computeNormalizationScore(profile).normalizationLevel;
          } catch {}
          return (
            <li key={col.id}>
              <span className="font-semibold">{col.originalName}</span>: <span className={
                normalizationLevel === "strong"
                  ? "text-rose-700"
                  : normalizationLevel === "light"
                  ? "text-amber-700"
                  : "text-slate-500"
              }>{normalizationLevel}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { CandidatePanel } from "@/components/CandidatePanel";
import { FilePreviewTable } from "@/components/FilePreviewTable";
import { ResultsTable } from "@/components/ResultsTable";
import { UploadCard } from "@/components/UploadCard";
import { createFeedbackStore } from "@/lib/feedback/store";
import { correlationResultsToCsv } from "@/lib/export/csv";
import { SAMPLE_FILE_A_CSV, SAMPLE_FILE_B_CSV } from "@/lib/mock/sampleData";
import { fileToBase64, LocalParsedPreview, parseClientFilePreview } from "@/lib/parsers/client";
import { CorrelationResponse, FeedbackEntry } from "@/lib/types";
import { downloadTextFile } from "@/lib/utils/download";

const store = createFeedbackStore();

type StatusFilter = "accepted" | "all" | "exact" | "transformed" | "semantic" | "unmatched";

export default function HomePage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [previewA, setPreviewA] = useState<LocalParsedPreview | null>(null);
  const [previewB, setPreviewB] = useState<LocalParsedPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CorrelationResponse | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("accepted");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [feedback, setFeedback] = useState<Record<string, "correct" | "incorrect" | "pending">>({});

  const selectedResult = useMemo(
    () => result?.results.find((row) => row.sourceColumnId === selectedResultId) ?? null,
    [result, selectedResultId]
  );

  useEffect(() => {
    const saved = store.getAll();
    const map: Record<string, "correct" | "incorrect" | "pending"> = {};
    saved.forEach((item) => {
      map[item.sourceColumnId] = item.verdict;
    });
    setFeedback(map);
  }, []);

  async function handleFileAChange(file: File | null) {
    setFileA(file);
    setResult(null);
    setError(null);
    if (!file) {
      setPreviewA(null);
      return;
    }

    try {
      const preview = await parseClientFilePreview(file);
      setPreviewA(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse File A");
    }
  }

  async function handleFileBChange(file: File | null) {
    setFileB(file);
    setResult(null);
    setError(null);
    if (!file) {
      setPreviewB(null);
      return;
    }

    try {
      const preview = await parseClientFilePreview(file);
      setPreviewB(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse File B");
    }
  }

  async function changeSheet(side: "A" | "B", sheetName: string) {
    try {
      if (side === "A" && fileA) {
        const preview = await parseClientFilePreview(fileA, sheetName);
        setPreviewA(preview);
      }
      if (side === "B" && fileB) {
        const preview = await parseClientFilePreview(fileB, sheetName);
        setPreviewB(preview);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-parse selected sheet");
    }
  }

  async function runCorrelation() {
    if (!fileA || !fileB || !previewA || !previewB) {
      setError("Upload and parse both files before correlation");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [base64A, base64B] = await Promise.all([fileToBase64(fileA), fileToBase64(fileB)]);

      const response = await fetch("/api/correlate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileA: {
            fileName: fileA.name,
            extension: previewA.extension,
            sheetName: previewA.selectedSheet,
            contentBase64: base64A
          },
          fileB: {
            fileName: fileB.name,
            extension: previewB.extension,
            sheetName: previewB.selectedSheet,
            contentBase64: base64B
          }
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Correlation request failed");
      }

      const data = (await response.json()) as CorrelationResponse;
      setResult(data);
      setSelectedResultId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error while correlating");
    } finally {
      setLoading(false);
    }
  }

  function applyOverride(sourceColumnId: string, targetColumnId: string | null) {
    const normalized = targetColumnId === "__NULL__" ? null : targetColumnId;
    setOverrides((prev) => ({ ...prev, [sourceColumnId]: normalized }));
  }

  function setFeedbackVerdict(sourceColumnId: string, verdict: "correct" | "incorrect") {
    setFeedback((prev) => ({ ...prev, [sourceColumnId]: verdict }));
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, sourceColumnId);
    const fallbackTarget = result?.results.find((row) => row.sourceColumnId === sourceColumnId)?.bestMatch?.targetColumnId ?? null;
    const entry: FeedbackEntry = {
      sourceColumnId,
      selectedTargetColumnId: hasOverride ? overrides[sourceColumnId] ?? null : fallbackTarget,
      verdict,
      updatedAt: new Date().toISOString()
    };
    store.upsert(entry);
  }

  function exportJson() {
    if (!result) return;
    downloadTextFile(JSON.stringify(result, null, 2), "correlation-result.json", "application/json");
  }

  function exportCsv() {
    if (!result) return;
    const csv = correlationResultsToCsv(result.results);
    downloadTextFile(csv, "correlation-result.csv", "text/csv;charset=utf-8");
  }

  async function loadMockData() {
    const mockA = new File([SAMPLE_FILE_A_CSV], "mock-a.csv", { type: "text/csv" });
    const mockB = new File([SAMPLE_FILE_B_CSV], "mock-b.csv", { type: "text/csv" });
    await handleFileAChange(mockA);
    await handleFileBChange(mockB);
  }

  const targetColumns = result?.fileB.columns.map((col) => ({ id: col.id, name: col.originalName })) ?? [];

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <header className="mb-6 rounded-xl border border-slate-200 bg-white/90 p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Financial Column Correlation Workbench</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">
          Upload two reconciliation inputs and infer column mappings using header similarity, value evidence, and financial type semantics.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-md bg-slatebrand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slatebrand-800"
            onClick={runCorrelation}
            disabled={loading}
          >
            {loading ? "Running correlation..." : "Run Correlation"}
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={loadMockData}
          >
            Load Mock Data
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            onClick={exportJson}
            disabled={!result}
          >
            Export JSON
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            onClick={exportCsv}
            disabled={!result}
          >
            Export CSV
          </button>
        </div>
        {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <UploadCard
          label="File A"
          file={fileA}
          preview={previewA}
          onFileChange={handleFileAChange}
          onSheetChange={(sheet) => changeSheet("A", sheet)}
        />
        <UploadCard
          label="File B"
          file={fileB}
          preview={previewB}
          onFileChange={handleFileBChange}
          onSheetChange={(sheet) => changeSheet("B", sheet)}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <FilePreviewTable title="File A Preview (first 10 rows)" headers={previewA?.headers ?? []} rows={previewA?.previewRows ?? []} />
        <FilePreviewTable title="File B Preview (first 10 rows)" headers={previewB?.headers ?? []} rows={previewB?.previewRows ?? []} />
      </section>

      {result ? (
        <section className="mt-6 space-y-4">
          <div className="card grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCell label="Total Source Columns" value={String(result.summary.totalSourceColumns)} />
            <SummaryCell label="Exact Matches" value={String(result.exactMatches.length)} />
            <SummaryCell label="Transformed Matches" value={String(result.transformedMatches.length)} />
            <SummaryCell label="Semantic Matches" value={String(result.semanticMatches.length)} />
            <SummaryCell label="Unmatched" value={String(result.unmatched.length)} />
            <SummaryCell label="Duplicate/Suspicious" value={String(result.duplicateOrSuspiciousColumns.length)} />
          </div>

          {/* Normalization Status for all columns in both files */}
          <div className="mb-4 grid gap-6 md:grid-cols-2">
            <NormalizationStatusList columns={result.fileA.columns} fileLabel={result.fileA.name || "File 1"} />
            <NormalizationStatusList columns={result.fileB.columns} fileLabel={result.fileB.name || "File 2"} />
          </div>

          <ResultsTable
            results={result.results}
            targetColumns={targetColumns}
            filter={filter}
            onFilterChange={setFilter}
            overrides={overrides}
            feedback={feedback}
            onOverride={applyOverride}
            onFeedback={setFeedbackVerdict}
            onInspectCandidates={(row) => setSelectedResultId(row.sourceColumnId)}
          />
        </section>
      ) : (
        <section className="card mt-6 p-8 text-center text-sm text-slate-500">
          Upload two files and run correlation to see mappings, confidence, and explainability details.
        </section>
      )}

      <CandidatePanel
        open={Boolean(selectedResult)}
        sourceColumn={selectedResult?.sourceColumnName ?? ""}
        candidates={selectedResult ? [selectedResult.bestMatch, ...selectedResult.alternatives].filter(Boolean) as NonNullable<typeof selectedResult.bestMatch>[] : []}
        onClose={() => setSelectedResultId(null)}
      />
    </main>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
