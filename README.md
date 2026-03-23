# Financial Column Correlation (Next.js + TypeScript)

Production-style MVP for financial reconciliation column mapping.

## Features

- Next.js App Router project (Vercel-friendly, serverless-ready)
- Upload 2 files: csv, txt, xls, xlsx
- Excel multi-sheet selection
- File preview (first 10 rows)
- Explainable correlation engine across:
  - Header similarity
  - Value overlap and format similarity
  - Semantic type similarity
  - Metadata similarity (null/uniqueness patterns)
- Conservative confidence and ambiguity detection
- Reverse check (best source candidate for each File B column)
- Manual override workflow and correctness feedback capture (local persistence abstraction)
- Export results as JSON and CSV
- Mock data support
- Unit tests for core normalization utilities

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Papa Parse (csv/txt parsing)
- SheetJS/xlsx (excel parsing)
- Vitest (unit tests)

## Project Structure

- app
  - api/correlate/route.ts
  - layout.tsx
  - page.tsx
- components
  - UploadCard.tsx
  - FilePreviewTable.tsx
  - ResultsTable.tsx
  - CandidatePanel.tsx
  - ConfidenceBadge.tsx
- lib
  - config/scoring.ts
  - correlation/
  - parsers/
  - normalization/
  - types/
  - export/
  - feedback/
  - mock/
  - utils/
- tests
  - normalization.test.ts
- public/samples

## Correlation Logic

Weighted score (configurable in lib/config/scoring.ts):

- headerWeight: 0.30
- valueWeight: 0.45
- typeWeight: 0.20
- metadataWeight: 0.05

Total score formula:

total =
0.30 * header_similarity +
0.45 * value_similarity +
0.20 * type_similarity +
0.05 * metadata_similarity

Status behavior:

- matched: confidence >= 80
- medium confidence bucket is tracked in summary
- weak: 40 to 79 (unless marked ambiguous)
- unmatched: < 40
- ambiguous: top candidates too close or one-to-many signals

## Run Locally

1. Install dependencies:

npm install

2. Start dev server:

npm run dev

3. Open app:

http://localhost:3000

4. Optional checks:

npm test
npm run build

## Deploy to Vercel

1. Push repository to Git provider.
2. Import project in Vercel.
3. Build command: npm run build
4. Output is standard Next.js output (auto-detected by Vercel).
5. No local disk persistence is required.

## API Contract

POST /api/correlate

Request:

{
  "fileA": {
    "fileName": "input1.csv",
    "extension": "csv",
    "sheetName": "optional-sheet",
    "contentBase64": "..."
  },
  "fileB": {
    "fileName": "input2.xlsx",
    "extension": "xlsx",
    "sheetName": "optional-sheet",
    "contentBase64": "..."
  }
}

Response includes:

- fileA metadata and columns
- fileB metadata and columns
- results (best match + alternatives per source column)
- reverseCheck
- summary counts
- explainability map

## Domain Safety Notes

- Long numeric identifiers remain strings and are not coerced into JavaScript numbers.
- Header similarity does not dominate mapping decisions.
- Value evidence is weighted highest for robust reconciliation behavior.
- Ambiguity is surfaced rather than force-matching.

## Future Enhancements

- Replace local feedback store with DB repository implementation (interface already isolated in lib/feedback/store.ts).
- Add embedding/LLM-assisted semantic scoring as optional layer after deterministic checks.
- Move upload payloads to object storage for very large files.
- Add background job orchestration for high-volume correlation runs.
