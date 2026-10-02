import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import { idSchema } from "../../utils/financeValidation";
export function newRecord() {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    sync_status: "pending" as const,
  };
}
export function validateId(id: string) {
  return idSchema.parse(id);
}
export async function withWriteTransaction<T>(
  db: SQLiteDatabase,
  task: (tx: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const separator = db.databasePath.lastIndexOf("/");
  const name = db.databasePath.slice(separator + 1);
  const directory =
    separator < 0 ? undefined : db.databasePath.slice(0, separator);
  // A dedicated connection prevents unrelated async queries from joining this transaction.
  const tx = await openDatabaseAsync(
    name,
    { ...db.options, useNewConnection: true },
    directory,
  );
  let begun = false;
  try {
    await tx.execAsync("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    await tx.execAsync("BEGIN IMMEDIATE");
    begun = true;
    const result = await task(tx);
    await tx.execAsync("COMMIT");
    begun = false;
    return result;
  } catch (error) {
    if (begun) await tx.execAsync("ROLLBACK");
    throw error;
  } finally {
    await tx.closeAsync();
  }
}
export async function archiveRecord(
  db: SQLiteDatabase,
  table: "accounts" | "categories",
  id: string,
) {
  validateId(id);
  const result = await db.runAsync(
    `UPDATE ${table} SET is_archived = 1, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at IS NULL`,
    new Date().toISOString(),
    id,
  );
  if (result.changes === 0) throw new Error("Record not found");
}
export async function restoreRecord(
  db: SQLiteDatabase,
  table: "accounts" | "categories",
  id: string,
) {
  validateId(id);
  const result = await db.runAsync(
    `UPDATE ${table} SET is_archived = 0, updated_at = ?, sync_status = 'pending' WHERE id = ? AND deleted_at IS NULL`,
    new Date().toISOString(),
    id,
  );
  if (!result.changes) throw new Error("Record not found");
}
