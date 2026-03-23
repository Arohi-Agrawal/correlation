import { NextRequest, NextResponse } from "next/server";
import { buildCorrelationMatrix } from "@/lib/correlation/matcher";
import { attachExplainability } from "@/lib/correlation/resultFormatter";
import { parseFilePayload } from "@/lib/parsers";
import { CorrelateRequestBody } from "@/lib/types";

export const runtime = "nodejs";

function validatePayload(body: Partial<CorrelateRequestBody>) {
  if (!body.fileA || !body.fileB) {
    throw new Error("Both fileA and fileB are required");
  }

  const files = [body.fileA, body.fileB];
  files.forEach((file, idx) => {
    if (!file.fileName || !file.extension || !file.contentBase64) {
      throw new Error(`File ${idx + 1} payload is incomplete`);
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CorrelateRequestBody>;
    validatePayload(body);

    const parsedA = parseFilePayload({
      extension: body.fileA!.extension,
      contentBase64: body.fileA!.contentBase64,
      side: "A",
      fileName: body.fileA!.fileName,
      sheetName: body.fileA!.sheetName
    });

    const parsedB = parseFilePayload({
      extension: body.fileB!.extension,
      contentBase64: body.fileB!.contentBase64,
      side: "B",
      fileName: body.fileB!.fileName,
      sheetName: body.fileB!.sheetName
    });

    const result = attachExplainability(buildCorrelationMatrix(parsedA, parsedB));
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected correlation failure";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
