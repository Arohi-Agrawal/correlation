// Utility: finance-aware header synonym dictionary
export const headerSynonyms: Record<string, string[]> = {
  amount: ['txn amount', 'auth amount', 'posted amount', 'replaced amount', 'amt', 'transaction amount'],
  transaction_id: ['txn id', 'trace id', 'reference id', 'rrn', 'stan', 'trans id'],
  card_number: ['pan', 'masked pan', 'card no', 'card #'],
  date: ['transaction date', 'posting date', 'entry date', 'value date'],
  merchant_text: ['merchant', 'merchant name', 'merchant desc', 'merchant description'],
  narration_text: ['narration', 'description', 'particulars', 'details'],
  response_code: ['auth code', 'status code', 'resp code'],
  currency: ['ccy', 'currency code', 'currency'],
  debit_amount: ['debit', 'dr'],
  credit_amount: ['credit', 'cr'],
};

export function expandHeaderSynonyms(header: string): string[] {
  const norm = header.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const matches: string[] = [];
  for (const [key, synonyms] of Object.entries(headerSynonyms)) {
    if (key === norm || synonyms.includes(norm)) {
      matches.push(key, ...synonyms);
    }
  }
  return matches.length ? matches : [norm];
}
