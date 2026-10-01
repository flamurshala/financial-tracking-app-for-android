import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { idSchema } from '../../utils/financeValidation';
export function newRecord() {
  const timestamp = new Date().toISOString();
  return { id: randomUUID(), created_at: timestamp, updated_at: timestamp, deleted_at: null, sync_status: 'pending' as const };
}
export function validateId(id: string) { return idSchema.parse(id); }
export async function withWriteTransaction<T>(db: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  let result!: T;
  await db.withExclusiveTransactionAsync(async (tx) => { result = await task(tx); });
  return result;
}
export async function archiveRecord(db: SQLiteDatabase, table: 'accounts' | 'categories', id: string) {
  validateId(id);
  const result = await db.runAsync(`UPDATE ${table} SET is_archived = 1, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at IS NULL`, new Date().toISOString(), id);
  if (result.changes === 0) throw new Error('Record not found');
}
