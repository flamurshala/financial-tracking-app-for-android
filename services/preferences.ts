import type { SQLiteDatabase } from "expo-sqlite";
import {
  getMetadata,
  setMetadata,
} from "../database/repositories/metadataRepository";
import { useSettingsStore } from "../store/settingsStore";
export async function loadPreferences(db: SQLiteDatabase) {
  useSettingsStore
    .getState()
    .setHideBalances(
      (await getMetadata(db, "settings.hide_balances")) === "true",
    );
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

export async function saveHideBalances(db: SQLiteDatabase, hidden: boolean) {
  await setMetadata(db, "settings.hide_balances", String(hidden));
  useSettingsStore.getState().setHideBalances(hidden);
}
