import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { initializeNotifications } from '../services/notifications';
import { useSettingsStore } from '../store/settingsStore';
export function ReminderLifecycle() {
  const db = useSQLiteContext();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void initializeNotifications(db).then(state => {
        if (active) useSettingsStore.getState().setReminder(state);
      }).catch(() => {
        if (active) useSettingsStore.getState().setReminderError('Unable to load reminder settings. Please retry.');
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [db]);
  return null;
}
