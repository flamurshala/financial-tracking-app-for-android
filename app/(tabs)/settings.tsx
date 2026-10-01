import { router } from "expo-router";
import { Screen, Card, SectionTitle, Body, Button } from "../../components/ui";
import { useSettingsStore } from "../../store/settingsStore";
import { currency } from "../../constants/config";
import { isSupabaseConfigured } from "../../services/supabase";
import { useEffect, useState } from "react";
import { Alert, Platform, Switch } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSQLiteContext } from "expo-sqlite";
import { initializeNotifications, rescheduleDailyFinanceReminder, sendTestNotification, openNotificationSettings } from "../../services/notifications";
import type { FinanceReminderSettings } from "../../types/reminder";
import { useAuthStore } from "../../store/authStore";
import { useSyncStore } from "../../store/syncStore";
import { synchronize } from "../../services/sync";
import { signOut } from "../../services/auth";
export default function Settings() {
  const setTheme = useSettingsStore((state) => state.setTheme);
  const reminder = useSettingsStore(state => state.reminder);
  const reminderError = useSettingsStore(state => state.reminderError);
  const session = useAuthStore(state => state.session);
  const authReady = useAuthStore(state => state.ready);
  const authError = useAuthStore(state => state.error);
  const sync = useSyncStore();
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [draftTime, setDraftTime] = useState(new Date());
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try { await operation(); }
    catch (error) { Alert.alert('Finance Reminder', error instanceof Error ? error.message : 'Unable to update reminder.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    // First appropriate use is the reminder settings screen, not every app launch.
    void initializeNotifications(db, true).then(state => useSettingsStore.getState().setReminder(state)).catch(() => useSettingsStore.getState().setReminderError('Unable to load reminder settings.'));
  }, [db]);
  const update = (settings: FinanceReminderSettings) => run(async () => {
    try {
      useSettingsStore.getState().setReminder(await rescheduleDailyFinanceReminder(db, settings));
    } catch {
      useSettingsStore.getState().setReminderError('Unable to save reminder settings. Please retry.');
    }
  });
  const time = reminder ? `${String(reminder.settings.hour).padStart(2, '0')}:${String(reminder.settings.minute).padStart(2, '0')}` : '--:--';
  return (
    <Screen>
      <SectionTitle>Finance Reminder</SectionTitle>
      <Card>
        <Body>Daily Reminder (your preference)</Body>
        <Switch accessibilityLabel="Daily Finance Reminder" value={reminder?.settings.enabled ?? true} disabled={busy || !reminder || Platform.OS === 'web'} onValueChange={enabled => { if (reminder) void update({ ...reminder.settings, enabled }); }} />
        <Button title={`Reminder Time: ${time}`} disabled={busy || !reminder || Platform.OS === 'web'} onPress={() => {
          const date = new Date();
          date.setHours(reminder?.settings.hour ?? 22, reminder?.settings.minute ?? 0, 0, 0);
          setDraftTime(date); setPicker(true);
        }} />
        {picker && <DateTimePicker mode="time" value={draftTime} is24Hour onChange={(event, date) => {
          if (Platform.OS === 'android') setPicker(false);
          if (event.type === 'set' && date) {
            setDraftTime(date);
            if (Platform.OS === 'android' && reminder) void update({ ...reminder.settings, hour: date.getHours(), minute: date.getMinutes() });
          }
        }} />}
        {picker && Platform.OS === 'ios' && <Button title="Save time" onPress={() => { setPicker(false); if (reminder) void update({ ...reminder.settings, hour: draftTime.getHours(), minute: draftTime.getMinutes() }); }} />}
        <Body>Notification Permission: {reminder?.permission ?? 'Checking'}</Body>
        <Body>Status: {reminder?.status ?? 'Checking'}</Body>
        {reminder?.error && <Body>{reminder.error}</Body>}
        {reminderError && <Body>{reminderError}</Body>}
        {reminder?.permission === 'denied' && <Body>Notifications are disabled for this app. Enable them in system settings to receive your daily finance reminder. Also check the Finance Reminders channel.</Body>}
        {reminder?.permission === 'undetermined' && <Body>Notification permission is required to receive reminders.</Body>}
        {Platform.OS !== 'web' && reminder?.permission !== 'unavailable' && <Button title="Open Settings" onPress={() => { void run(async () => { await openNotificationSettings(); }); }} />}
        <Button title="Refresh reminder status" disabled={busy} onPress={() => { void run(async () => { useSettingsStore.getState().setReminder(await initializeNotifications(db, true)); }); }} />
        {__DEV__ && <>
          <Body>Developer: verified daily schedules: {reminder?.scheduledCount ?? 'unknown'}</Body>
          <Button title="Send Test Notification" disabled={busy || !reminder || reminder.permission === 'unavailable'} onPress={() => { void run(async () => { await sendTestNotification(); Alert.alert('Test scheduled', 'A test notification is scheduled for 3 seconds from now.'); }); }} />
        </>}
      </Card>
      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <Body>Primary currency: {currency.code}</Body>
        <Body>Appearance preferences apply to this session.</Body>
        <Button
          title="Use device appearance"
          onPress={() => setTheme("system")}
        />
        <Button title="Light appearance" onPress={() => setTheme("light")} />
        <Button title="Dark appearance" onPress={() => setTheme("dark")} />
      </Card>
      <Card>
        <SectionTitle>Cloud Sync</SectionTitle>
        <Body>Account: {session?.user.email ?? 'Not signed in'}</Body>
        <Body>Status: {sync.status}</Body>
        <Body>Last Sync: {sync.lastSync ? new Date(sync.lastSync).toLocaleString() : 'Never'}</Body>
        {sync.error && <Body>{sync.error}</Body>}
        {authError && <Body>{authError}</Body>}
        {!isSupabaseConfigured && <Body>Add the Supabase project URL and public key to .env to enable optional cloud sync.</Body>}
        <Body>Signing out stops cloud sync and keeps all finances on this device. This local dataset stays bound to its first cloud account.</Body>
        {session ? <>
          <Button title={sync.status === 'Syncing' ? 'Syncing…' : 'Sync Now'} disabled={busy || sync.status === 'Syncing'} onPress={() => { void run(async () => { await synchronize(db); }); }} />
          <Button title="Sign Out" disabled={busy} onPress={() => { void run(async () => { const message = await signOut(); if (message) Alert.alert('Signed out', message); }); }} />
        </> : <Button title="Sign In" disabled={!authReady || busy} onPress={() => router.push('/(auth)/login')} />}
        {__DEV__ && <>
          <Body>Sync Debug: pending accounts {sync.pending.accounts}, categories {sync.pending.categories}, transactions {sync.pending.transactions}</Body>
          <Body>Cloud user: {session?.user.id ?? 'none'}</Body>
        </>}
      </Card>
    </Screen>
  );
}
