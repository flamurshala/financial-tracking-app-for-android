import type { SQLiteDatabase } from 'expo-sqlite';
import type { FinanceReminderSettings } from '../../types/reminder';
export async function loadReminderSettings(db: SQLiteDatabase): Promise<FinanceReminderSettings> {
  await db.runAsync("INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('reminder_enabled', 'true'), ('reminder_hour', '22'), ('reminder_minute', '0')");
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM app_metadata WHERE key IN ('reminder_enabled', 'reminder_hour', 'reminder_minute')");
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  const hour = Number(values.reminder_hour ?? 22);
  const minute = Number(values.reminder_minute ?? 0);
  return { enabled: values.reminder_enabled !== 'false', hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 22, minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0 };
}
export async function saveReminderSettings(db: SQLiteDatabase, settings: FinanceReminderSettings) {
  if (!Number.isInteger(settings.hour) || settings.hour < 0 || settings.hour > 23 || !Number.isInteger(settings.minute) || settings.minute < 0 || settings.minute > 59) throw new Error('Invalid reminder time');
  await db.withExclusiveTransactionAsync(async tx => {
    for (const [key, value] of Object.entries({ reminder_enabled: settings.enabled, reminder_hour: settings.hour, reminder_minute: settings.minute }))
      await tx.runAsync('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', key, String(value));
  });
}
