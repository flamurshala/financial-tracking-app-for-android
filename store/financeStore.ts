import { create } from 'zustand';
// UI state only. Financial records will be queried from SQLite repositories.
export const useFinanceStore = create<{ selectedAccountId: string | null; selectAccount: (id: string | null) => void }>((set) => ({ selectedAccountId: null, selectAccount: (selectedAccountId) => set({ selectedAccountId }) }));
