import { z } from 'zod';
import { accountInputSchema, categoryInputSchema, idSchema, centsSchema } from '../utils/financeValidation';
import { calendarDateSchema } from '../utils/dates';
export const financialTables = ['accounts', 'categories', 'transactions'] as const;
export type FinancialTable = typeof financialTables[number];
const base = z.object({ id: idSchema, user_id: idSchema, created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }), deleted_at: z.iso.datetime({ offset: true }).nullable(), sync_version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
export const remoteAccountSchema = base.extend({ ...accountInputSchema.shape, is_archived: z.boolean() });
export const remoteCategorySchema = base.extend({ ...categoryInputSchema.shape, is_default: z.boolean(), is_archived: z.boolean() });
export const remoteTransactionSchema = base.extend({ account_id: idSchema, category_id: idSchema.nullable(), type: z.enum(['income', 'expense']), amount_cents: centsSchema.positive(), description: z.string().trim().min(1).max(2000), transaction_date: calendarDateSchema, is_balance_adjustment: z.boolean() }).refine(row => row.is_balance_adjustment ? row.category_id === null : row.category_id !== null);
export type RemoteAccount = z.infer<typeof remoteAccountSchema>;
export type RemoteCategory = z.infer<typeof remoteCategorySchema>;
export type RemoteTransaction = z.infer<typeof remoteTransactionSchema>;
export type RemoteRecord = RemoteAccount | RemoteCategory | RemoteTransaction;
export const remoteSchemas = { accounts: remoteAccountSchema, categories: remoteCategorySchema, transactions: remoteTransactionSchema };
export type CloudSyncStatus = 'Not Configured' | 'Not Authenticated' | 'Offline' | 'Syncing' | 'Synced' | 'Pending' | 'Error' | 'Account Blocked';
export interface SyncResult { pushed: number; pulled: number; pending: number; lastSync: string }
export interface LocalSyncMetadata { local_revision: number; server_version: number; sync_status: 'pending' | 'synced' | 'error' }
type CloudTable<Row> = { Row: Row; Insert: Omit<Row, 'updated_at' | 'sync_version'>; Update: Partial<Omit<Row, 'sync_version'>>; Relationships: [] };
export interface CloudDatabase {
  public: {
    Tables: { accounts: CloudTable<RemoteAccount>; categories: CloudTable<RemoteCategory>; transactions: CloudTable<RemoteTransaction> };
    Views: { [_ in never]: never };
    Functions: { finance_sync_cursor: { Args: Record<string, never>; Returns: number } };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
