const NULL_LIKE = new Set(["", "null", "nil", "none", "na", "n/a", "-", "--", "undefined"]);

const CURRENCY_SIGNS_REGEX = /[₹$€£¥]/g;
const THOUSANDS_SEPARATOR_REGEX = /,/g;
const DUPLICATE_SEPARATORS_REGEX = /[\s\-_/]{2,}/g;

export function normalizeNullLike(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  if (!str) {
    return null;
  }

  return NULL_LIKE.has(str.toLowerCase()) ? null : str;
}

export function normalizeFinancialId(value: string): string {
  return value.replace(/\s+/g, "").replace(/[|]/g, "").trim();
}

export function normalizeAmount(value: string): string {
  const cleaned = value.replace(CURRENCY_SIGNS_REGEX, "").replace(THOUSANDS_SEPARATOR_REGEX, "").trim();
  if (!/^[-+]?\d*(\.\d+)?$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    return value.trim().toLowerCase();
  }

  const sign = cleaned.startsWith("-") ? "-" : "";
  const numeric = cleaned.replace(/^[-+]/, "");
  const [intPart, decimalPart] = numeric.split(".");
  const normalizedInt = String(Number(intPart || "0"));
  const normalizedDecimal = decimalPart ? decimalPart.replace(/0+$/, "") : "";
  return `${sign}${normalizedInt}${normalizedDecimal ? `.${normalizedDecimal}` : ""}`;
}

export function normalizeDate(value: string): string | null {
  const isoLike = value.trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(isoLike)) {
    return null;
  }

  const ddmmyyyy = isoLike.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Avoid coercing plain numerics (e.g. amounts or IDs) into dates.
  if (!/[\/-]|\d{4}-\d{2}-\d{2}|t\d{2}:\d{2}|:\d{2}|[a-z]{3,}/i.test(isoLike)) {
    return null;
  }

  const parsed = new Date(isoLike);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function normalizeText(value: string): string {
  return value.toLowerCase().trim().replace(DUPLICATE_SEPARATORS_REGEX, " ").replace(/\s+/g, " ");
}

export function normalizeCellValue(value: unknown): string | null {
  const base = normalizeNullLike(value);
  if (base === null) {
    return null;
  }

  const compact = normalizeFinancialId(base);
  if (/^\d{10,}$/.test(compact)) {
    return compact;
  }

  if (!/\s/.test(base) && /^[A-Za-z0-9\-*#]{8,}$/.test(compact) && /[A-Za-z]/.test(compact)) {
    return compact.toLowerCase();
  }

  const maybeDate = normalizeDate(base);
  if (maybeDate) {
    return maybeDate;
  }

  const amount = normalizeAmount(base);
  if (amount !== base.trim().toLowerCase()) {
    return amount;
  }

  return normalizeText(base);
}
