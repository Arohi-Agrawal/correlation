export const FINANCIAL_SYNONYMS: Record<string, string[]> = {
  transaction_id: [
    "txn ref",
    "transaction ref",
    "transaction id",
    "trace id",
    "stan",
    "rrn",
    "reference no",
    "transaction identifier"
  ],
  reference_number: ["ref", "reference", "reference number", "ref no", "retrieval ref"],
  amount: ["amount", "txn amount", "auth amount", "clearing amount", "posted amount"],
  debit_amount: ["dr", "debit", "withdrawal", "debit amount"],
  credit_amount: ["cr", "credit", "deposit", "credit amount"],
  currency: ["curr", "ccy", "currency code", "currency"],
  date: ["txn date", "value date", "posting date", "settlement date", "book date"],
  datetime: ["txn datetime", "timestamp", "transaction timestamp"],
  account_number: ["acct", "a/c", "account no", "account number", "iban"],
  masked_pan: ["masked pan", "card", "card number", "pan"],
  merchant_name: ["merchant", "merchant name", "acceptor name"],
  narration: ["narration", "description", "remarks", "details"],
  status_code: ["status", "status code", "response code"],
  auth_code: ["auth", "auth code", "authorization code"],
  customer_id: ["customer", "customer id", "cust id"],
  branch_code: ["branch", "branch code", "sol id"]
};

export const HEADER_ABBREVIATIONS: Record<string, string> = {
  txn: "transaction",
  ref: "reference",
  no: "number",
  num: "number",
  amt: "amount",
  dr: "debit",
  cr: "credit",
  ccy: "currency",
  curr: "currency",
  acct: "account",
  a: "account",
  desc: "description",
  dt: "date",
  ts: "timestamp"
};

export const HEADER_STOPWORDS = new Set(["column", "field", "value"]);
