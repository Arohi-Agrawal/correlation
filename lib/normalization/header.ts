import { FINANCIAL_SYNONYMS, HEADER_ABBREVIATIONS, HEADER_STOPWORDS } from "@/lib/correlation/synonyms";

export function splitCompositeTokens(input: string): string[] {
  const camelSplit = input.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return camelSplit
    .replace(/[_.\-/]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function normalizeHeader(raw: string): string {
  const tokens = splitCompositeTokens(raw)
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .map((token) => HEADER_ABBREVIATIONS[token] ?? token)
    .filter((token) => !HEADER_STOPWORDS.has(token));

  return tokens.join(" ").trim();
}

export function tokenizeHeader(raw: string): string[] {
  return normalizeHeader(raw)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function headerSynonymGroups(normalizedHeader: string): string[] {
  const groups: string[] = [];

  for (const [group, terms] of Object.entries(FINANCIAL_SYNONYMS)) {
    if (terms.some((term) => normalizeHeader(term) === normalizedHeader || normalizedHeader.includes(normalizeHeader(term)))) {
      groups.push(group);
    }
  }

  return groups;
}
