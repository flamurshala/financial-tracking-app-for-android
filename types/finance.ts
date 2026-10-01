export type CurrencyCode = 'EUR';
export type MinorUnits = number;
export type AccountType = 'cash' | 'bank' | 'card' | 'savings' | 'other';
export type TransactionType = 'expense' | 'income';
export type CategoryType = TransactionType | 'both';
export type SyncStatus = 'pending' | 'synced' | 'error';
export interface SyncRecord {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}
export interface Account extends SyncRecord {
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  initial_balance_cents: MinorUnits;
  is_archived: 0 | 1;
}
export interface Category extends SyncRecord {
  name: string;
  type: CategoryType;
  icon: string | null;
  is_default: 0 | 1;
  is_archived: 0 | 1;
}
export interface Transaction extends SyncRecord {
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  amount_cents: MinorUnits;
  description: string;
  transaction_date: string;
  is_balance_adjustment: 0 | 1;
}
