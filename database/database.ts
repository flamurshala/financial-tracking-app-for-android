import type { SQLiteDatabase } from "expo-sqlite";
import { migrations } from "./migrations";
import { reportError } from "../utils/errors";
export async function initializeDatabase(db: SQLiteDatabase) {
  try {
    await db.execAsync(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL);",
      );
      const applied = await tx.getAllAsync<{ version: number }>(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      if (applied.some((row) => row.version > migrations.length))
        throw new Error("Database belongs to a newer app version");
      if (
        applied.some((row, index) => row.version !== index + 1) ||
        migrations.some((migration, index) => migration.version !== index + 1)
      )
        throw new Error("Migration history must be sequential");
      for (const migration of migrations) {
        if (applied.some((row) => row.version === migration.version)) continue;
        await migration.up(tx);
        await tx.runAsync(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
          migration.version,
          migration.name,
          new Date().toISOString(),
        );
      }
    });
  } catch (error) {
    reportError("Database initialization failed", error);
    throw new Error(
      "Local database could not be opened. Restart the app; your data has not been deleted.",
    );
  }
}
