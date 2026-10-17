/* The currency every money figure is shown in, on both clients. Chosen in
   Settings > Preferences and stored on the user's account server-side
   (PATCH /api/account/preferences); each client calls setCurrency() once it
   knows the account, and every formatter below picks it up from there, so
   nothing has to thread the code through props. Amounts are stored as plain
   numbers: switching currency relabels them, it doesn't convert them. */

export const DEFAULT_CURRENCY = 'USD';

/* English names are the fallback for runtimes without Intl.DisplayNames
   (older Hermes builds). Commonly used in the regions the app serves first. */
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'RWF', name: 'Rwandan Franc' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'BIF', name: 'Burundian Franc' },
  { code: 'CDF', name: 'Congolese Franc' },
  { code: 'SSP', name: 'South Sudanese Pound' },
  { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'SOS', name: 'Somali Shilling' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'XOF', name: 'West African CFA Franc' },
  { code: 'XAF', name: 'Central African CFA Franc' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'MWK', name: 'Malawian Kwacha' },
  { code: 'MZN', name: 'Mozambican Metical' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' }
];

let current = DEFAULT_CURRENCY;

export function setCurrency(code) {
  current = /^[A-Z]{3}$/.test(code || '') ? code : DEFAULT_CURRENCY;
}

export function getCurrency() {
  return current;
}

/* Localized currency name when the runtime can provide one. */
export function currencyName(code, language) {
  try {
    const names = new Intl.DisplayNames([language || 'en'], { type: 'currency' });
    const name = names.of(code);
    if (name && name !== code) return name;
  } catch { /* no Intl.DisplayNames */ }
  return (CURRENCIES.find((c) => c.code === code) || {}).name || code;
}

/* How many decimals the currency normally uses (0 for RWF/UGX/XOF, 2 for USD). */
function currencyDigits(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

/* Agricoders writing rules: the dollar sign goes first ("$20"), every other
   currency shows its code after the amount ("100,000 RWF").
   formatMoney(1234)                    -> "$1,234"
   formatMoney(1234.5)                  -> "$1,234.50" (whole amounts drop the cents)
   formatMoney(1234.5, { decimals: 0 }) -> "$1,235"
   formatMoney(25000, { currency: 'RWF' }) -> "25,000 RWF" */
export function formatMoney(value, { decimals, currency = current } = {}) {
  const n = Number(value) || 0;
  const digits = currencyDigits(currency);
  const max = decimals == null ? digits : Math.min(decimals, digits);
  const min = decimals == null ? (Number.isInteger(n) ? 0 : max) : max;
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  return placeCurrency(n < 0 && Number(body.replace(/,/g, '')) ? '-' : '', body, currency);
}

function placeCurrency(sign, body, currency) {
  return currency === 'USD' ? `${sign}$${body}` : `${sign}${body} ${currency}`;
}

/* The label used next to money inputs, such as "Amount ($)" or "Amount (RWF)". */
export function currencySymbol(currency = current) {
  return currency === 'USD' ? '$' : currency;
}

/* ---------- Per-record currency + conversion ----------
   Finance and feeding records each carry the currency they were recorded
   in (records from before that existed have none and count as the display
   currency). Totals and charts convert every amount into the display
   currency with the latest exchange rates (GET /api/rates, units per 1 USD),
   which each client loads with setRates(). */

let rates = null;

export function setRates(next) {
  rates = next && typeof next === 'object' ? next : null;
}

export function getRates() {
  return rates;
}

/* `amount` recorded in `from`, expressed in `to`. Without a rate for either
   side the amount is returned unchanged. */
export function convert(amount, from, to = current) {
  const n = Number(amount) || 0;
  if (!from || from === to || !rates || !rates[from] || !rates[to]) return n;
  return (n / rates[from]) * rates[to];
}

/* The currency a record was entered in. */
export function recordCurrency(record) {
  return (record && record.currency) || current;
}

/* A record's money field (amount / cost) converted to the display currency
   — what every total and chart adds up. */
export function moneyOf(record, field = 'amount') {
  return convert(record && record[field], recordCurrency(record));
}

/* A record's money field formatted in its own currency, for list rows. */
export function formatRecordMoney(record, field = 'amount', opts = {}) {
  return formatMoney(record && record[field], { ...opts, currency: recordCurrency(record) });
}

/* ---------- Compact numbers for chart labels ----------
   Every chart prints the value of each mark; these keep long figures short
   enough to sit on a bar: 950 → "950", 12 400 → "12.4K", 3 100 000 → "3.1M". */
function compactParts(value) {
  const n = Number(value) || 0;
  const a = Math.abs(n);
  if (a < 1000) return { sign: n < 0 && Math.round(a * 10) ? '-' : '', num: String(a >= 100 ? Math.round(a) : Math.round(a * 10) / 10), suffix: '' };
  const [div, suffix] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const scaled = a / div;
  return { sign: n < 0 ? '-' : '', num: scaled >= 100 ? String(Math.round(scaled)) : String(Math.round(scaled * 10) / 10), suffix };
}

export function formatCompact(value) {
  const { sign, num, suffix } = compactParts(value);
  return `${sign}${num}${suffix}`;
}

export function formatMoneyCompact(value, { currency = current } = {}) {
  const n = Number(value) || 0;
  if (Math.abs(n) < 1000) return formatMoney(Math.round(n), { decimals: 0, currency });
  const { sign, num, suffix } = compactParts(n);
  return placeCurrency(sign, `${num}${suffix}`, currency);
}
