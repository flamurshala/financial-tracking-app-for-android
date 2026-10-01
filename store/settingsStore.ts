import { create } from 'zustand';
import type { ReminderState } from '../types/reminder';
type ThemeMode = 'system' | 'light' | 'dark';
interface SettingsStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  reminder: ReminderState | null;
  reminderError: string | null;
  setReminder: (reminder: ReminderState) => void;
  setReminderError: (reminderError: string) => void;
}
export const useSettingsStore = create<SettingsStore>(set => ({
  theme: 'system', setTheme: theme => set({ theme }),
  reminder: null, reminderError: null,
  setReminder: reminder => set({ reminder, reminderError: null }),
  setReminderError: reminderError => set({ reminderError }),
}));
