import * as XLSX from "xlsx";
import { FileSide, ParsedFile } from "@/lib/types";
import { inferHeaders, rowsToColumns } from "@/lib/parsers/utils";

export function getExcelSheetNames(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  return workbook.SheetNames;
}

export function parseExcelBuffer(
  buffer: ArrayBuffer,
  side: FileSide,
  fileName: string,
  selectedSheetName?: string
): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  const sheetName = selectedSheetName && workbook.SheetNames.includes(selectedSheetName)
    ? selectedSheetName
    : workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel file has no sheet");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: null
  });

  const { headers, dataRows } = inferHeaders(rows);
  return rowsToColumns(side, headers, dataRows, fileName, sheetName, workbook.SheetNames);
}
