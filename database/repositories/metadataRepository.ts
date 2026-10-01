import type { SQLiteDatabase } from 'expo-sqlite';
export async function getMetadata(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', key);
  return row?.value ?? null;
}
export async function setMetadata(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
