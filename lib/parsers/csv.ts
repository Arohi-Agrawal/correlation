import Papa from "papaparse";
import { FileSide, ParsedFile } from "@/lib/types";
import { inferHeaders, rowsToColumns } from "@/lib/parsers/utils";

function detectDelimiter(text: string): string {
  const candidates = [",", "\t", "|", ";"];
  const lines = text.split(/\r?\n/).slice(0, 5);
  let best = ",";
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = lines.reduce((acc, line) => acc + (line.split(candidate).length - 1), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function parseCsvText(content: string, side: FileSide, fileName: string): ParsedFile {
  const delimiter = detectDelimiter(content);
  const parsed = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: "greedy",
    dynamicTyping: false
  });

  if (parsed.errors.length) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }

  const rows = parsed.data as unknown[][];
  const { headers, dataRows } = inferHeaders(rows);
  return rowsToColumns(side, headers, dataRows, fileName);
}
