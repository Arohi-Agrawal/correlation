import { FileSide, ParsedFile } from "@/lib/types";
import { parseCsvText } from "@/lib/parsers/csv";
import { getExcelSheetNames, parseExcelBuffer } from "@/lib/parsers/excel";

function base64ToArrayBuffer(contentBase64: string): ArrayBuffer {
  const binary = Buffer.from(contentBase64, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

export function parseFilePayload(options: {
  extension: string;
  contentBase64: string;
  side: FileSide;
  fileName: string;
  sheetName?: string;
}): ParsedFile {
  const ext = options.extension.toLowerCase();
  const buffer = base64ToArrayBuffer(options.contentBase64);

  if (["csv", "txt"].includes(ext)) {
    const text = Buffer.from(buffer).toString("utf8");
    return parseCsvText(text, options.side, options.fileName);
  }

  if (["xls", "xlsx"].includes(ext)) {
    return parseExcelBuffer(buffer, options.side, options.fileName, options.sheetName);
  }

  throw new Error(`Unsupported file extension: ${ext}`);
}

export function extractSheetNamesFromPayload(contentBase64: string): string[] {
  const buffer = base64ToArrayBuffer(contentBase64);
  return getExcelSheetNames(buffer);
}
