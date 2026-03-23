import { ChangeEvent } from "react";
import { LocalParsedPreview } from "@/lib/parsers/client";

interface UploadCardProps {
  label: string;
  file: File | null;
  preview: LocalParsedPreview | null;
  onFileChange: (file: File | null) => void;
  onSheetChange: (sheetName: string) => void;
}

export function UploadCard({ label, file, preview, onFileChange, onSheetChange }: UploadCardProps) {
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    onFileChange(selected);
  };

  return (
    <section className="card p-4">
      <h2 className="section-title mb-3">{label}</h2>
      <input
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        type="file"
        accept=".csv,.txt,.xls,.xlsx"
        onChange={handleFile}
      />
      <p className="mt-2 text-xs text-slate-500">Supports csv, txt, xls, xlsx.</p>

      {file && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div>Name: {file.name}</div>
          <div>Size: {(file.size / 1024).toFixed(1)} KB</div>
        </div>
      )}

      {preview && preview.availableSheets.length > 1 && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-slate-700">Sheet</label>
          <select
            value={preview.selectedSheet ?? preview.availableSheets[0]}
            onChange={(event) => onSheetChange(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {preview.availableSheets.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
