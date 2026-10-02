import type { SQLiteDatabase } from "expo-sqlite";
import {
  getMetadata,
  setMetadata,
} from "../database/repositories/metadataRepository";
import { useSettingsStore } from "../store/settingsStore";
export async function loadPreferences(db: SQLiteDatabase) {
  const theme = await getMetadata(db, "settings.theme");
  if (theme === "system" || theme === "light" || theme === "dark")
    useSettingsStore.getState().setTheme(theme);
}
export async function saveTheme(
  db: SQLiteDatabase,
  theme: "system" | "light" | "dark",
) {
  await setMetadata(db, "settings.theme", theme);
  useSettingsStore.getState().setTheme(theme);
}
