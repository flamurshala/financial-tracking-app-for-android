import { getSupabaseClient } from '../supabase';
import { remoteSchemas, type FinancialTable, type RemoteRecord, type RemoteAccount, type RemoteCategory, type RemoteTransaction } from '../../types/sync';
export interface CloudGateway {
  push: (table: FinancialTable, row: RemoteRecord) => Promise<RemoteRecord>;
  find: (table: FinancialTable, userId: string, id: string) => Promise<RemoteRecord | null>;
  cursor: () => Promise<number>;
  page: (table: FinancialTable, userId: string, after: number, through: number, afterId: string | null) => Promise<RemoteRecord[]>;
}
export function supabaseGateway(): CloudGateway {
  const client = getSupabaseClient();
  return {
    async push(table, row) {
      // Explicit whitelists exclude SQLite-only sync metadata and search columns.
      const { sync_version: _version, updated_at: _timestamp, ...input } = row;
      const query = table === 'accounts'
        ? client.from('accounts').upsert(input as Omit<RemoteAccount, 'updated_at' | 'sync_version'>, { onConflict: 'user_id,id' }).select().single()
        : table === 'categories'
          ? client.from('categories').upsert(input as Omit<RemoteCategory, 'updated_at' | 'sync_version'>, { onConflict: 'user_id,id' }).select().single()
          : client.from('transactions').upsert(input as Omit<RemoteTransaction, 'updated_at' | 'sync_version'>, { onConflict: 'user_id,id' }).select().single();
      const { data, error } = await query;
      if (error) throw error;
      return remoteSchemas[table].parse(data);
    },
    async find(table, userId, id) {
      const { data, error } = await client.from(table).select().eq('user_id', userId).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? remoteSchemas[table].parse(data) : null;
    },
    async cursor() {
      const { data, error } = await client.rpc('finance_sync_cursor');
      if (error) throw error;
      if (!Number.isSafeInteger(data) || data === null || data < 0) throw new Error('Invalid cloud cursor');
      return data;
    },
    async page(table, userId, after, through, afterId) {
      // Keyset pagination over UUID avoids offset shifts during concurrent writes.
      let query = client.from(table).select().eq('user_id', userId).gte('sync_version', after).lte('sync_version', through).order('id').limit(200);
      if (afterId) query = query.gt('id', afterId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(row => remoteSchemas[table].parse(row));
    },
  };
}
