import type { SQLiteDatabase } from 'expo-sqlite';
import { SyncEngine } from './sync/syncEngine';
import { supabaseGateway } from './sync/cloudGateway';
import { isSupabaseConfigured } from './supabase';
import { authGeneration } from './auth';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { useFinanceStore } from '../store/financeStore';
import { pendingCounts, OwnerMismatchError } from '../database/repositories/syncRepository';
import { getMetadata } from '../database/repositories/metadataRepository';
const engine = new SyncEngine();
let online = false;
let running: Promise<void> | null = null;
let requestedWhileRunning = false;
export function setSyncConnectivity(value: boolean) {
  online = value;
  if (!value && useAuthStore.getState().session) useSyncStore.getState().setState({ status: 'Offline' });
}
export async function refreshSyncInfo(db: SQLiteDatabase) {
  const pending = await pendingCounts(db);
  const lastSync = await getMetadata(db, 'last_successful_sync_at');
  useSyncStore.getState().setState({ pending, lastSync });
}
export function synchronize(db: SQLiteDatabase): Promise<void> {
  if (running) { requestedWhileRunning = true; return running; }
  const session = useAuthStore.getState().session;
  if (!isSupabaseConfigured || !session || !online) {
    useSyncStore.getState().setState({ status: !isSupabaseConfigured ? 'Not Configured' : !session ? 'Not Authenticated' : 'Offline' });
    return refreshSyncInfo(db).catch(() => undefined);
  }
  const generation = authGeneration;
  const isAuthorized = () => online && generation === authGeneration && useAuthStore.getState().session?.user.id === session.user.id;
  useSyncStore.getState().setState({ status: 'Syncing', error: null });
  running = (async () => {
    try {
      const result = await engine.run(db, supabaseGateway(), { userId: session.user.id, isAuthorized });
      if (isAuthorized()) {
        useSyncStore.getState().setState({ status: result.pending ? 'Pending' : 'Synced', lastSync: result.lastSync, error: null });
        useFinanceStore.getState().invalidate(undefined, 'cloud');
      }
    } catch (error) {
      if (generation === authGeneration) {
        useSyncStore.getState().setState({ status: !online ? 'Offline' : error instanceof OwnerMismatchError ? 'Account Blocked' : 'Error', error: error instanceof OwnerMismatchError ? error.message : 'Sync failed. Your data is safely stored on this device and will be retried later.' });
        // Avoid logging payloads, credentials, tokens or financial records.
        if (__DEV__) console.warn('Cloud sync failed', error instanceof OwnerMismatchError ? 'owner mismatch' : 'request or integrity failure');
      }
    } finally {
      try { await refreshSyncInfo(db); } catch { /* Next trigger retries metadata reads. */ }
    }
  })().finally(() => {
    running = null;
    if (requestedWhileRunning) {
      requestedWhileRunning = false;
      if (online && useAuthStore.getState().session) setTimeout(() => { void synchronize(db); }, 750);
    }
  });
  return running;
}
