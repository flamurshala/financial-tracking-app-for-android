import { currency } from '../constants/config';
export function validateCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Amount must be safe integer cents');
  return value;
}
/** Accept ungrouped EUR decimals with a dot or comma; reject signs and ambiguous grouping. */
export function decimalToCents(input: string): number {
  const value = input.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new Error('Enter a positive amount with at most two decimal places, without thousands separators');
  const [whole, fraction = ''] = value.split(/[.,]/);
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large');
  return Number(cents);
}
export function centsToDecimal(cents: number): string {
  validateCents(cents);
  const value = BigInt(cents);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
export function sumCents(values: readonly number[]): number {
  const sum = values.reduce((total, value) => total + BigInt(validateCents(value)), 0n);
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Calculated amount exceeds safe integer cents');
  return Number(sum);
}
export function formatAmount(minorUnits: number) {
  validateCents(minorUnits);
  // Format integer whole units and replace fraction; no floating-point money conversion.
  const amount = BigInt(minorUnits);
  const magnitude = amount < 0n ? -amount : amount;
  const formatter = new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code });
  const parts = formatter.formatToParts(magnitude / 100n);
  const formatted = parts.map((part) => part.type === 'fraction' ? String(magnitude % 100n).padStart(2, '0') : part.value).join('');
  return amount < 0n ? `-${formatted}` : formatted;
}
