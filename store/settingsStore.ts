import { create } from 'zustand';
type ThemeMode = 'system' | 'light' | 'dark';
export const useSettingsStore = create<{ theme: ThemeMode; setTheme: (theme: ThemeMode) => void }>((set) => ({ theme: 'system', setTheme: (theme) => set({ theme }) }));
