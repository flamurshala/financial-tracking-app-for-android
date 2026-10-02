import { useEffect } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { loadPreferences } from "../services/preferences";
export function PreferencesLifecycle() {
  const db = useSQLiteContext();
  useEffect(() => {
    void loadPreferences(db).catch(() => undefined);
  }, [db]);
  return null;
}
