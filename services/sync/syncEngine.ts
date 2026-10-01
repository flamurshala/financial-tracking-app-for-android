import type { SQLiteDatabase } from 'expo-sqlite';
import { financialTables, type FinancialTable, type RemoteRecord, type SyncResult } from '../../types/sync';
import { acknowledgePush, claimLocalOwner, commitPull, mergeRemote, pendingCounts, pendingRows, toRemote } from '../../database/repositories/syncRepository';
import { getMetadata } from '../../database/repositories/metadataRepository';
import { withWriteTransaction } from '../../database/repositories/shared';
import type { CloudGateway } from './cloudGateway';
export interface SyncContext { userId: string; isAuthorized: () => boolean }
export class SyncEngine {
  private running: Promise<SyncResult> | null = null;
  // The runtime instance is shared by all trigger sources.
  run(db: SQLiteDatabase, gateway: CloudGateway, context: SyncContext): Promise<SyncResult> {
    if (this.running) return this.running;
    this.running = this.cycle(db, gateway, context).finally(() => { this.running = null; });
    return this.running;
  }
  private async cycle(db: SQLiteDatabase, gateway: CloudGateway, context: SyncContext): Promise<SyncResult> {
    const guard = () => { if (!context.isAuthorized()) throw new Error('Session or connectivity changed'); };
    guard();
    await claimLocalOwner(db, context.userId);
    let pushed = 0;
    for (const table of financialTables) {
      // Bounded snapshot batches: each UUID gets at most one upload per cycle.
      // A concurrent local edit remains pending for the next normal trigger.
      let afterId = '';
      while (true) {
        guard();
        const rows = await db.getAllAsync<Awaited<ReturnType<typeof pendingRows>>[number]>(`SELECT * FROM ${table} WHERE sync_status <> 'synced' AND id > ? ORDER BY id LIMIT 100`, afterId);
        if (!rows.length) break;
        for (const row of rows) {
          guard();
          // Fresh local built-ins must not overwrite a restored cloud customization.
          const existing = table === 'categories' && 'is_default' in row && row.is_default === 1 && row.local_revision === 0 && row.server_version === 0
            ? await gateway.find(table, context.userId, row.id) : null;
          guard();
          if (existing) {
            await withWriteTransaction(db, async tx => {
              guard();
              await tx.runAsync(`UPDATE categories SET sync_status = 'synced' WHERE id = ? AND local_revision = ? AND sync_status <> 'synced'`, row.id, row.local_revision);
              await mergeRemote(tx, table, existing, context.userId);
              guard();
            });
          } else {
            const remote = await gateway.push(table, toRemote(table, row, context.userId));
            guard();
            if (remote.user_id !== context.userId || remote.id !== row.id) throw new Error('Cloud acknowledgement mismatch');
            await acknowledgePush(db, table, row, remote);
            pushed++;
          }
          afterId = row.id;
        }
      }
    }
    guard();
    const previous = Number(await getMetadata(db, 'cloud_sync_cursor') ?? 0);
    const through = await gateway.cursor();
    if (!Number.isSafeInteger(previous) || through < previous) throw new Error('Cloud cursor moved backwards. Restore requires explicit handling.');
    const remoteRows: Record<FinancialTable, RemoteRecord[]> = { accounts: [], categories: [], transactions: [] };
    let pulled = 0;
    for (const table of financialTables) {
      let afterId: string | null = null;
      while (true) {
        guard();
        const page = await gateway.page(table, context.userId, previous, through, afterId);
        if (!page.length) break;
        remoteRows[table].push(...page);
        pulled += page.length;
        const nextId: string = page[page.length - 1].id;
        if (afterId && nextId <= afterId) throw new Error('Non-progressing cloud pagination');
        afterId = nextId;
      }
    }
    guard();
    const lastSync = new Date().toISOString(); // UI audit time only; never a conflict/cursor clock.
    await commitPull(db, context.userId, remoteRows, through, lastSync, context.isAuthorized);
    const counts = await pendingCounts(db);
    return { pushed, pulled, pending: counts.accounts + counts.categories + counts.transactions, lastSync };
  }
}
