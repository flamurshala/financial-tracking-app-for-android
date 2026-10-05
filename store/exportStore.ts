import { create } from "zustand";
import type { TransactionFilters } from "../types/statistics";
export const useExportStore = create<{
  filters: TransactionFilters | null;
  setFilters: (filters: TransactionFilters) => void;
}>((set) => ({
  filters: null,
  setFilters: (filters) => set({ filters: { ...filters } }),
}));
