import type { SQLiteDatabase } from 'expo-sqlite';
import type { Account } from '../../types/finance';
import { accountInputSchema, type AccountInput } from '../../utils/financeValidation';
import { sumCents } from '../../utils/currency';
import { archiveRecord, newRecord, validateId, withWriteTransaction } from './shared';
export async function createAccount(db: SQLiteDatabase, input: AccountInput): Promise<Account> {
  const data = accountInputSchema.parse(input);
  const record: Account = { ...newRecord(), ...data, is_archived: 0 };
  await db.runAsync('INSERT INTO accounts (id, name, type, currency, initial_balance_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', record.id, record.name, record.type, record.currency, record.initial_balance_cents, record.created_at, record.updated_at);
  return record;
}
/** Full replacement of editable fields, preserving history and archive status. */
export async function updateAccount(db: SQLiteDatabase, id: string, input: AccountInput): Promise<Account> {
  validateId(id);
  const data = accountInputSchema.parse(input);
  return withWriteTransaction(db, async (tx) => {
    const current = await getAccountById(tx, id);
    if (!current) throw new Error('Account not found');
    const record: Account = { ...current, ...data, updated_at: new Date().toISOString(), sync_status: 'pending' };
    await tx.runAsync('UPDATE accounts SET name = ?, type = ?, currency = ?, initial_balance_cents = ?, updated_at = ?, sync_status = ? WHERE id = ?', record.name, record.type, record.currency, record.initial_balance_cents, record.updated_at, record.sync_status, id);
    return record;
  });
}
export async function archiveAccount(db: SQLiteDatabase, id: string): Promise<void> { await archiveRecord(db, 'accounts', id); }
export async function getAccounts(db: SQLiteDatabase, includeArchived = false): Promise<Account[]> {
  return db.getAllAsync<Account>(`SELECT * FROM accounts WHERE deleted_at IS NULL ${includeArchived ? '' : 'AND is_archived = 0'} ORDER BY name COLLATE NOCASE, id`);
}
export async function getAccountById(db: SQLiteDatabase, id: string): Promise<Account | null> {
  validateId(id);
  return db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL', id);
}
export async function getAccountBalance(db: SQLiteDatabase, id: string): Promise<number> {
  validateId(id);
  // One statement gives a consistent snapshot even if another connection writes.
  const rows = await db.getAllAsync<{ initial_balance_cents: number; amount_cents: number | null; type: 'income' | 'expense' | null }>(`SELECT a.initial_balance_cents, t.amount_cents, t.type FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL WHERE a.id = ? AND a.deleted_at IS NULL`, id);
  if (rows.length === 0) throw new Error('Account not found');
  return sumCents([rows[0].initial_balance_cents, ...rows.map((row) => row.amount_cents === null ? 0 : row.type === 'income' ? row.amount_cents : -row.amount_cents)]);
}
/** Includes archived accounts: they still represent owned money. */
export async function getCombinedBalance(db: SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<{ cents: number }>(`SELECT initial_balance_cents AS cents FROM accounts WHERE deleted_at IS NULL UNION ALL SELECT CASE t.type WHEN 'income' THEN t.amount_cents ELSE -t.amount_cents END AS cents FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.deleted_at IS NULL AND a.deleted_at IS NULL`);
  return sumCents(rows.map((row) => row.cents));
}
