import { create } from "zustand";
// UI state only. Financial records will be queried from SQLite repositories.
export const useFinanceStore = create<{
  selectedAccountId: string | null;
  selectAccount: (id: string | null) => void;
  revision: number;
  notice: string | null;
  invalidate: (notice?: string) => void;
  clearNotice: () => void;
}>((set) => ({
  selectedAccountId: null,
  selectAccount: (selectedAccountId) => set({ selectedAccountId }),
  revision: 0,
  notice: null,
  invalidate: (notice) =>
    set((state) => ({ revision: state.revision + 1, notice: notice ?? null })),
  clearNotice: () => set({ notice: null }),
}));
