import type { SQLiteDatabase } from 'expo-sqlite';
import { z } from 'zod';
import type { Transfer, CreateTransferInput } from '../../types/finance';
import { idSchema, centsSchema } from '../../utils/financeValidation';
import { calendarDateSchema } from '../../utils/dates';
import { getAccountById, getAccountBalance } from './accountRepository';
import { sumCents } from '../../utils/currency';
import { newRecord, validateId, withWriteTransaction } from './shared';
export const transferInputSchema = z.object({
  from_account_id: idSchema, to_account_id: idSchema,
  amount_cents: centsSchema.positive(), transfer_date: calendarDateSchema,
  note: z.string().trim().max(2000),
}).refine(value => value.from_account_id !== value.to_account_id, { message: 'Choose different source and destination accounts' });
export interface TransferView extends Transfer { from_account_name: string; to_account_name: string }
export async function getTransferById(db: SQLiteDatabase, id: string): Promise<Transfer | null> {
  validateId(id);
  return db.getFirstAsync<Transfer>('SELECT * FROM transfers WHERE id=? AND deleted_at IS NULL', id);
}
export async function saveTransfer(db: SQLiteDatabase, input: CreateTransferInput, id?: string): Promise<Transfer> {
  const data = transferInputSchema.parse(input);
  if (id) validateId(id);
  return withWriteTransaction(db, async tx => {
    const current = id ? await getTransferById(tx, id) : null;
    if (id && !current) throw new Error('Transfer not found');
    for (const accountId of [data.from_account_id, data.to_account_id]) {
      const account = await getAccountById(tx, accountId);
      if (!account || (account.is_archived && accountId !== current?.from_account_id && accountId !== current?.to_account_id)) throw new Error('Choose active accounts');
    }
    // Preserve negative balances, but reject results outside exact integer cents.
    const affected = new Set([data.from_account_id, data.to_account_id, ...(current ? [current.from_account_id, current.to_account_id] : [])]);
    for (const accountId of affected) sumCents([
      await getAccountBalance(tx, accountId),
      current?.from_account_id === accountId ? current.amount_cents : 0,
      current?.to_account_id === accountId ? -current.amount_cents : 0,
      data.from_account_id === accountId ? -data.amount_cents : 0,
      data.to_account_id === accountId ? data.amount_cents : 0,
    ]);
    const record: Transfer = { ...(current ?? newRecord()), ...data, updated_at: new Date().toISOString(), sync_status: 'pending' };
    if (current) await tx.runAsync("UPDATE transfers SET from_account_id=?,to_account_id=?,amount_cents=?,transfer_date=?,note=?,updated_at=?,sync_status='pending' WHERE id=?", data.from_account_id,data.to_account_id,data.amount_cents,data.transfer_date,data.note,record.updated_at,record.id);
    else await tx.runAsync('INSERT INTO transfers(id,from_account_id,to_account_id,amount_cents,transfer_date,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',record.id,data.from_account_id,data.to_account_id,data.amount_cents,data.transfer_date,data.note,record.created_at,record.updated_at);
    return record;
  });
}
export async function deleteTransfer(db: SQLiteDatabase, id: string) {
  validateId(id);
  const now = new Date().toISOString();
  await db.runAsync("UPDATE transfers SET deleted_at=?,updated_at=?,sync_status='pending' WHERE id=? AND deleted_at IS NULL",now,now,id);
}
export async function getTransferHistory(db: SQLiteDatabase, limit = 50, offset = 0): Promise<TransferView[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid pagination');
  return db.getAllAsync<TransferView>(`SELECT t.*, f.name AS from_account_name, a.name AS to_account_name FROM transfers t JOIN accounts f ON f.id=t.from_account_id JOIN accounts a ON a.id=t.to_account_id WHERE t.deleted_at IS NULL ORDER BY t.transfer_date DESC,t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`,limit,offset);
}
