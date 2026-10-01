import { currency } from '../constants/config';
export function formatAmount(minorUnits: number) {
  if (!Number.isSafeInteger(minorUnits)) throw new Error('Amount must be an integer in minor units');
  return new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code }).format(minorUnits / 100);
}
