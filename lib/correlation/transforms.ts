export function normalizeDateLike(value: string): string {
  const candidate = value.trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(candidate)) {
    return candidate;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return candidate;
  }

  const match = candidate.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }

  if (!/[\/-]|\d{4}-\d{2}-\d{2}|t\d{2}:\d{2}|:\d{2}|[a-z]{3,}/i.test(candidate)) {
    return candidate;
  }

  const parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return candidate;
}

export function datePart(value: string): string {
  const normalized = normalizeDateLike(value);
  const isoDateTime = normalized.match(/^(\d{4}-\d{2}-\d{2})[t\s].*$/i);
  if (isoDateTime) {
    return isoDateTime[1];
  }
  return normalized;
}

export function normalizeAmountLike(value: string): string {
  const cleaned = value.replace(/[₹$€£¥,]/g, "").trim();
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

export function stripPaddedNumeric(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!/^\d+$/.test(compact)) {
    return compact.toLowerCase();
  }
  return compact.replace(/^0+(?=\d)/, "");
}

export function panFingerprint(value: string): string | null {
  const compact = value.replace(/\s+/g, "");
  const digits = compact.replace(/\D/g, "");

  if (digits.length >= 12) {
    return `${digits.slice(0, 8)}${digits.slice(-4)}`;
  }

  if (digits.length >= 10) {
    return `${digits.slice(0, 6)}${digits.slice(-4)}`;
  }

  const masked = compact.match(/^(\d{6,8})[*xX#-]+(\d{4})$/);
  if (masked) {
    return `${masked[1]}${masked[2]}`;
  }

  return null;
}
