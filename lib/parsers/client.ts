import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FileSide, ParsedFile } from "@/lib/types";
import { inferHeaders } from "@/lib/parsers/utils";
import { normalizeCellValue } from "@/lib/normalization/values";
import { rowsToColumns } from "@/lib/parsers/utils";

export interface LocalParsedPreview {
  fileName: string;
  extension: string;
  availableSheets: string[];
  selectedSheet?: string;
  headers: string[];
  previewRows: Record<string, string | null>[];
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function buildPreview(fileName: string, extension: string, headers: string[], rows: unknown[][], selectedSheet?: string, availableSheets: string[] = []): LocalParsedPreview {
  const previewRows = rows.slice(0, 10).map((row) => {
    const rec: Record<string, string | null> = {};
    headers.forEach((header, idx) => {
      rec[header] = normalizeCellValue(row[idx]);
    });
    return rec;
  });

  return {
    fileName,
    extension,
    availableSheets,
    selectedSheet,
    headers,
    previewRows
  };
}

export async function parseClientFilePreview(file: File, selectedSheet?: string): Promise<LocalParsedPreview> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (["csv", "txt"].includes(extension)) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, {
      delimiter: "",
      skipEmptyLines: "greedy",
      dynamicTyping: false
    });

    if (parsed.errors.length) {
      throw new Error(parsed.errors[0].message);
    }

    const rows = parsed.data as unknown[][];
    const { headers, dataRows } = inferHeaders(rows);
    return buildPreview(file.name, extension, headers, dataRows);
  }

  if (["xls", "xlsx"].includes(extension)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
    const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
      ? selectedSheet
      : workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("No sheet available in workbook");
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      blankrows: false,
      defval: null
    });

    const { headers, dataRows } = inferHeaders(rows);
    return buildPreview(file.name, extension, headers, dataRows, sheetName, workbook.SheetNames);
  }

  throw new Error("Unsupported file type. Allowed: csv, txt, xls, xlsx");
}

export async function parseClientFile(file: File, side: FileSide, selectedSheet?: string): Promise<ParsedFile> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (["csv", "txt"].includes(extension)) {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, {
      delimiter: "",
      skipEmptyLines: "greedy",
      dynamicTyping: false
    });

    if (parsed.errors.length) {
      throw new Error(parsed.errors[0].message);
    }

    const rows = parsed.data as unknown[][];
    const { headers, dataRows } = inferHeaders(rows);
    return rowsToColumns(side, headers, dataRows, file.name);
  }

  if (["xls", "xlsx"].includes(extension)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
    const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
      ? selectedSheet
      : workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("No sheet available in workbook");
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      blankrows: false,
      defval: null
    });

    const { headers, dataRows } = inferHeaders(rows);
    return rowsToColumns(side, headers, dataRows, file.name, sheetName, workbook.SheetNames);
  }

  throw new Error("Unsupported file type. Allowed: csv, txt, xls, xlsx");
}
