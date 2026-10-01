import { create } from 'zustand';
import type { CloudSyncStatus } from '../types/sync';
export const useSyncStore = create<{
  status: CloudSyncStatus;
  lastSync: string | null;
  error: string | null;
  pending: { accounts: number; categories: number; transactions: number };
  setState: (state: Partial<{ status: CloudSyncStatus; lastSync: string | null; error: string | null; pending: { accounts: number; categories: number; transactions: number } }>) => void;
}>(set => ({ status: 'Not Authenticated', lastSync: null, error: null, pending: { accounts: 0, categories: 0, transactions: 0 }, setState: state => set(state) }));
