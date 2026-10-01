import { create } from "zustand";
// UI state only. Financial records will be queried from SQLite repositories.
export const useFinanceStore = create<{
  selectedAccountId: string | null;
  selectAccount: (id: string | null) => void;
  revision: number;
  notice: string | null;
  changeSource: 'local' | 'cloud';
  invalidate: (notice?: string, changeSource?: 'local' | 'cloud') => void;
  clearNotice: () => void;
}>((set) => ({
  selectedAccountId: null,
  selectAccount: (selectedAccountId) => set({ selectedAccountId }),
  revision: 0,
  notice: null,
  changeSource: 'local',
  invalidate: (notice, changeSource = 'local') =>
    set((state) => ({ revision: state.revision + 1, notice: notice ?? (changeSource === 'cloud' ? state.notice : null), changeSource })),
  clearNotice: () => set({ notice: null }),
}));
