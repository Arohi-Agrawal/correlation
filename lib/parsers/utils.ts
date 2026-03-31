import { ParsedColumn, ParsedFile, FileSide } from "@/lib/types";
import { normalizeHeader } from "@/lib/normalization/header";
import { normalizeCellValue } from "@/lib/normalization/values";

function makeSafeHeaderName(raw: string, used: Set<string>, index: number): string {
  const normalized = normalizeHeader(raw) || `column ${index + 1}`;
  let safe = normalized;
  let counter = 1;
  while (used.has(safe)) {
    counter += 1;
    safe = `${normalized} ${counter}`;
  }
  used.add(safe);
  return safe;
}

export function inferHeaders(rows: unknown[][]): { headers: string[]; dataRows: unknown[][] } {
  if (!rows.length) {
    return { headers: [], dataRows: [] };
  }

  const first = rows[0] ?? [];
  const firstFilled = first.filter((cell) => normalizeCellValue(cell) !== null).length;
  const headerLikely = firstFilled > 0;

  if (headerLikely) {
    const headers = first.map((cell, idx) => {
      const value = normalizeCellValue(cell);
      return value ? String(cell).trim() : `Column_${idx + 1}`;
    });

    return { headers, dataRows: rows.slice(1) };
  }

  let width = 0;
  for (const row of rows) {
    if (row.length > width) {
      width = row.length;
    }
  }
  const generated = Array.from({ length: width }, (_, i) => `Column_${i + 1}`);
  return { headers: generated, dataRows: rows };
}

export function rowsToColumns(
  side: FileSide,
  headers: string[],
  rows: unknown[][],
  fileName: string,
  sheetName?: string,
  availableSheets?: string[]
): ParsedFile {
  const used = new Set<string>();
  const safeHeaders = headers.map((h, idx) => makeSafeHeaderName(h, used, idx));

  const columns: ParsedColumn[] = safeHeaders.map((safeName, idx) => {
    const originalName = headers[idx] || `Column_${idx + 1}`;
    return {
      id: `${side}_${idx + 1}`,
      side,
      sourceIndex: idx,
      originalName,
      normalizedName: normalizeHeader(originalName),
      safeName,
      values: rows.map((row) => normalizeCellValue(row[idx]))
    };
  });

  const previewRows = rows.slice(0, 10).map((row) => {
    const shaped: Record<string, string | null> = {};
    safeHeaders.forEach((header, idx) => {
      shaped[header] = normalizeCellValue(row[idx]);
    });
    return shaped;
  });

  return {
    name: fileName,
    side,
    sheetName,
    availableSheets,
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
    previewRows
  };
}
