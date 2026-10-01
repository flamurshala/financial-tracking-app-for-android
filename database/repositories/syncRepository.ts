import type { SQLiteDatabase } from 'expo-sqlite';
import type { Account, Category, Transaction } from '../../types/finance';
import { financialTables, remoteSchemas, type FinancialTable, type LocalSyncMetadata, type RemoteRecord } from '../../types/sync';
import { getMetadata, setMetadata } from './metadataRepository';
import { withWriteTransaction } from './shared';
import { normalizeSearchText } from '../../utils/search';
export type LocalRecord = (Account | Category | Transaction) & LocalSyncMetadata;
export class OwnerMismatchError extends Error {
  constructor() { super('This device belongs to another cloud account. Sign in with its original account to synchronize.'); }
}
export async function claimLocalOwner(db: SQLiteDatabase, userId: string) {
  await withWriteTransaction(db, async tx => {
    const owner = await getMetadata(tx, 'local_owner_user_id');
    if (owner && owner !== userId) throw new OwnerMismatchError();
    if (!owner) await setMetadata(tx, 'local_owner_user_id', userId);
  });
}
export async function assertLocalOwner(db: SQLiteDatabase, userId: string) {
  const owner = await getMetadata(db, 'local_owner_user_id');
  if (owner && owner !== userId) throw new OwnerMismatchError();
}
export function pendingRows(db: SQLiteDatabase, table: FinancialTable, limit = 100) {
  return db.getAllAsync<LocalRecord>(`SELECT * FROM ${table} WHERE sync_status <> 'synced' ORDER BY id LIMIT ?`, limit);
}
export async function pendingCounts(db: SQLiteDatabase) {
  const counts = { accounts: 0, categories: 0, transactions: 0 };
  for (const table of financialTables) counts[table] = (await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE sync_status <> 'synced'`))?.count ?? 0;
  return counts;
}
export function toRemote(table: FinancialTable, row: LocalRecord, userId: string) {
  const base = { id: row.id, user_id: userId, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at, sync_version: 1 };
  if (table === 'accounts' && 'initial_balance_cents' in row) return remoteSchemas.accounts.parse({ ...base, name: row.name, type: row.type, currency: row.currency, initial_balance_cents: row.initial_balance_cents, is_archived: Boolean(row.is_archived) });
  if (table === 'categories' && 'is_default' in row) return remoteSchemas.categories.parse({ ...base, name: row.name, type: row.type, icon: row.icon, is_default: Boolean(row.is_default), is_archived: Boolean(row.is_archived) });
  if (table === 'transactions' && 'account_id' in row) return remoteSchemas.transactions.parse({ ...base, account_id: row.account_id, category_id: row.category_id, type: row.type, amount_cents: row.amount_cents, description: row.description, transaction_date: row.transaction_date, is_balance_adjustment: Boolean(row.is_balance_adjustment) });
  throw new Error('Entity/table mismatch');
}
// Compare revisions, not phone-clock timestamps: even two edits in the same millisecond are distinct.
export async function acknowledgePush(db: SQLiteDatabase, table: FinancialTable, snapshot: LocalRecord, remote: RemoteRecord) {
  await db.runAsync(`UPDATE ${table} SET sync_status = 'synced', server_version = ?, updated_at = ? WHERE id = ? AND local_revision = ? AND sync_status <> 'synced'`, remote.sync_version, remote.updated_at, snapshot.id, snapshot.local_revision);
}
export async function mergeRemote(db: SQLiteDatabase, table: FinancialTable, unknownRow: unknown, userId: string) {
  const remote = remoteSchemas[table].parse(unknownRow);
  if (remote.user_id !== userId) throw new Error('Remote owner mismatch');
  const current = await db.getFirstAsync<LocalRecord>(`SELECT * FROM ${table} WHERE id = ?`, remote.id);
  if (current && current.sync_status !== 'synced') return; // Never discard an unsent edit.
  if (current && current.server_version >= remote.sync_version) return;
  const { user_id: _owner, sync_version, ...fields } = remote;
  const local: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(fields)) local[key] = typeof value === 'boolean' ? Number(value) : value;
  local.sync_status = 'synced';
  local.server_version = sync_version;
  if (table === 'transactions' && 'description' in remote) local.description_search = normalizeSearchText(remote.description);
  const keys = Object.keys(local);
  await db.runAsync(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${keys.filter(key => key !== 'id').map(key => `${key}=excluded.${key}`).join(',')}`, Object.values(local));
}
export async function commitPull(db: SQLiteDatabase, userId: string, rows: Record<FinancialTable, RemoteRecord[]>, cursor: number, lastSync: string, stillAuthorized: () => boolean) {
  await withWriteTransaction(db, async tx => {
    if (!stillAuthorized()) throw new Error('Session changed');
    await assertLocalOwner(tx, userId);
    for (const table of financialTables) for (const row of rows[table]) await mergeRemote(tx, table, row, userId);
    if (!stillAuthorized()) throw new Error('Session changed');
    await setMetadata(tx, 'cloud_sync_cursor', String(cursor));
    await setMetadata(tx, 'last_successful_sync_at', lastSync);
  });
}
