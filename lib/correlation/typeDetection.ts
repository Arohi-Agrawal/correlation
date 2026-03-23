import { InferredColumnType, ParsedColumn } from "@/lib/types";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateTimeRegex = /^\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}(:\d{2})?/i;
const numericRegex = /^[-+]?\d+(\.\d+)?$/;
const currencyRegex = /^[A-Z]{3}$/;
const cardRegex = /^(?:\d[\s-]*){13,19}$/;
const maskedCardRegex = /^(\d{4,8})[xX*#-]{2,}(\d{2,6})$/;
const debitCreditRegex = /^(dr|cr|debit|credit|d|c)$/i;
const statusRegex = /^(approved|declined|failed|pending|success|error|reversed|00|01|05|09|12)$/i;

function clean(v: string): string {
  return v.trim();
}

function digitsOnly(v: string): string {
  return clean(v).replace(/\D/g, "");
}

function amountLike(v: string): boolean {
  const normalized = clean(v).replace(/[₹$€£¥,\s]/g, "");
  return /^[-+]?\d+(\.\d{1,4})?$/.test(normalized);
}

function ratio(values: Array<string | null>, predicate: (value: string) => boolean): number {
  const nonNull = values.filter((v): v is string => v !== null);
  if (!nonNull.length) {
    return 0;
  }
  const hits = nonNull.filter(predicate).length;
  return hits / nonNull.length;
}

function headerHas(source: string, ...terms: string[]): boolean {
  return terms.some((term) => source.includes(term));
}

export function detectObservedType(values: Array<string | null>): InferredColumnType {
  const dateRatio = ratio(values, (v) => dateRegex.test(clean(v)));
  const dateTimeRatio = ratio(values, (v) => dateTimeRegex.test(clean(v)));
  const numericRatio = ratio(values, (v) => numericRegex.test(clean(v)));
  const amountRatio = ratio(values, (v) => amountLike(v));
  const currencyRatio = ratio(values, (v) => currencyRegex.test(clean(v).toUpperCase()));
  const cardRatio = ratio(values, (v) => cardRegex.test(clean(v)) || maskedCardRegex.test(clean(v)));
  const maskedPanRatio = ratio(values, (v) => maskedCardRegex.test(clean(v)) || (/\*{2,}|x{2,}/i.test(v) && /\d{2,}/.test(v)));
  const debitCreditRatio = ratio(values, (v) => debitCreditRegex.test(clean(v)));
  const statusRatio = ratio(values, (v) => statusRegex.test(clean(v)));
  const accountRatio = ratio(values, (v) => {
    const digits = digitsOnly(v);
    return digits.length >= 8 && digits.length <= 18 && !maskedCardRegex.test(clean(v));
  });
  const transactionIdRatio = ratio(values, (v) => /^[A-Za-z0-9\-_/]{8,}$/.test(clean(v)) && /[A-Za-z]/.test(clean(v)));
  const textRatio = ratio(values, (v) => /[A-Za-z]/.test(clean(v)));
  const longTextRatio = ratio(values, (v) => clean(v).split(/\s+/).length >= 2 || clean(v).length >= 15);

  if (currencyRatio > 0.8) return "currency";
  if (dateTimeRatio > 0.72) return "datetime";
  if (dateRatio > 0.75) return "date";
  if (debitCreditRatio > 0.8) return "debit_credit";
  if (cardRatio > 0.55) return maskedPanRatio > 0.25 ? "masked_pan" : "card_number";
  if (statusRatio > 0.75) return "status_code";
  if (amountRatio > 0.82) return "amount";
  if (numericRatio > 0.9) return "generic_numeric";
  if (transactionIdRatio > 0.7) return "transaction_id";
  if (accountRatio > 0.72 && textRatio < 0.2) return "account_number";
  if (longTextRatio > 0.7 && textRatio > 0.7) return "narration_text";
  if (textRatio > 0.75) return "generic_text";

  return "unknown";
}

export function detectColumnType(column: ParsedColumn): InferredColumnType {
  const header = column.normalizedName;
  const values = column.values;

  const dateRatio = ratio(values, (v) => dateRegex.test(clean(v)));
  const dateTimeRatio = ratio(values, (v) => dateTimeRegex.test(clean(v)));
  const numericRatio = ratio(values, (v) => numericRegex.test(clean(v)));
  const currencyRatio = ratio(values, (v) => currencyRegex.test(clean(v).toUpperCase()));
  const maskedPanRatio = ratio(values, (v) => maskedCardRegex.test(clean(v)) || (/\*{2,}|x{2,}/i.test(v) && /\d{2,}/.test(v)));
  const cardRatio = ratio(values, (v) => cardRegex.test(clean(v)) || maskedCardRegex.test(clean(v)));
  const longIdRatio = ratio(values, (v) => /^[A-Za-z0-9\-]{8,}$/.test(clean(v)));

  if (headerHas(header, "debit", "withdrawal", "dr")) return "debit_amount";
  if (headerHas(header, "credit", "deposit", "cr")) return "credit_amount";
  if (headerHas(header, "tran type", "part tran", "debit credit", "drcr")) {
    if (dateTimeRatio >= 0.5) return "datetime";
    if (dateRatio >= 0.5) return "date";
    return "debit_credit";
  }
  if (headerHas(header, "amount", "amt") && numericRatio > 0.5) return "amount";
  if (headerHas(header, "currency", "ccy", "curr") || currencyRatio > 0.7) return "currency";
  if (headerHas(header, "datetime", "timestamp") && dateTimeRatio > 0.2) return "datetime";
  if (headerHas(header, "date", "value date", "posting") && dateRatio > 0.4) return "date";
  if (headerHas(header, "time", "timestamp", "datetime")) return "datetime";
  if (headerHas(header, "merchant", "acceptor")) return "merchant_text";
  if (headerHas(header, "narration", "description", "remark", "particular")) return "narration_text";
  if (headerHas(header, "status", "response")) return "status_code";
  if (headerHas(header, "auth", "authorization")) return "auth_code";
  if (headerHas(header, "customer", "cust") || header.endsWith("customer id")) return "customer_id";
  if (headerHas(header, "branch", "sol")) return "branch_code";
  if (headerHas(header, "account", "iban", "a c") || longIdRatio > 0.7) return "account_number";
  if (headerHas(header, "pan", "card") || cardRatio > 0.5 || maskedPanRatio > 0.5) return maskedPanRatio > 0.2 ? "masked_pan" : "card_number";
  if (headerHas(header, "transaction", "txn", "trace", "rrn", "stan", "identifier")) return "transaction_id";
  if (headerHas(header, "reference", "ref")) return "reference_number";

  const observed = detectObservedType(values);
  if (observed !== "unknown") return observed;
  if (ratio(values, (v) => clean(v).length > 12 && /\s/.test(clean(v))) > 0.4) return "narration_text";
  return "unknown";
}

const TYPE_COMPATIBILITY: Record<InferredColumnType, InferredColumnType[]> = {
  debit_credit: ["debit_credit", "status_code", "generic_text"],
  transaction_id: ["transaction_id", "reference_number", "auth_code"],
  reference_number: ["reference_number", "transaction_id", "auth_code", "customer_id"],
  amount: ["amount", "debit_amount", "credit_amount", "generic_numeric"],
  debit_amount: ["debit_amount", "amount", "generic_numeric"],
  credit_amount: ["credit_amount", "amount", "generic_numeric"],
  currency: ["currency"],
  date: ["date", "datetime"],
  datetime: ["datetime", "date"],
  card_number: ["card_number", "masked_pan", "account_number"],
  account_number: ["account_number", "reference_number", "customer_id"],
  masked_pan: ["masked_pan", "card_number", "account_number"],
  merchant_text: ["merchant_text", "narration_text", "merchant_name", "narration", "generic_text"],
  narration_text: ["narration_text", "merchant_text", "narration", "merchant_name", "generic_text"],
  merchant_name: ["merchant_name", "narration", "generic_text"],
  narration: ["narration", "merchant_name", "generic_text"],
  status_code: ["status_code", "generic_text"],
  auth_code: ["auth_code", "reference_number", "transaction_id"],
  customer_id: ["customer_id", "reference_number", "account_number"],
  branch_code: ["branch_code", "reference_number", "generic_text"],
  generic_text: ["generic_text", "narration", "merchant_name"],
  generic_numeric: ["generic_numeric", "amount", "debit_amount", "credit_amount"],
  unknown: ["unknown", "generic_text", "generic_numeric"]
};

export function compareColumnTypes(sourceType: InferredColumnType, targetType: InferredColumnType): { score: number; reason: string[] } {
  if (sourceType === targetType) {
    return { score: 100, reason: ["Inferred types are identical"] };
  }

  const compatible = TYPE_COMPATIBILITY[sourceType] ?? [];
  if (compatible.includes(targetType)) {
    return { score: 72, reason: ["Inferred financial types are compatible"] };
  }

  if (sourceType === "unknown" || targetType === "unknown") {
    return { score: 40, reason: ["One side has uncertain type inference"] };
  }

  return { score: 15, reason: ["Inferred types appear incompatible"] };
}
