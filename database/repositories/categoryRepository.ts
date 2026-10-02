import { protectedCategoryIds } from "../../constants/categoryProtection";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Category, TransactionType } from "../../types/finance";
import {
  categoryInputSchema,
  type CategoryInput,
} from "../../utils/financeValidation";
import {
  archiveRecord,
  restoreRecord,
  newRecord,
  validateId,
  withWriteTransaction,
} from "./shared";
export async function createCategory(
  db: SQLiteDatabase,
  input: CategoryInput,
): Promise<Category> {
  const record: Category = {
    ...newRecord(),
    ...categoryInputSchema.parse(input),
    is_default: 0,
    is_archived: 0,
  };
  await db.runAsync(
    "INSERT INTO categories (id, name, type, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    record.id,
    record.name,
    record.type,
    record.icon,
    record.created_at,
    record.updated_at,
  );
  return record;
}
export async function getCategoryById(
  db: SQLiteDatabase,
  id: string,
): Promise<Category | null> {
  validateId(id);
  return db.getFirstAsync<Category>(
    "SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",
    id,
  );
}
export async function updateCategory(
  db: SQLiteDatabase,
  id: string,
  input: CategoryInput,
): Promise<Category> {
  validateId(id);
  const data = categoryInputSchema.parse(input);
  return withWriteTransaction(db, async (tx) => {
    const current = await getCategoryById(tx, id);
    if (!current) throw new Error("Category not found");
    // Even soft-deleted history retains its category meaning for future sync.
    if (data.type !== "both") {
      const incompatible = await tx.getFirstAsync<{ id: string }>(
        "SELECT id FROM transactions WHERE category_id = ? AND type <> ? LIMIT 1",
        id,
        data.type,
      );
      if (incompatible)
        throw new Error(
          "Category type conflicts with existing transaction history",
        );
    }
    const record: Category = {
      ...current,
      ...data,
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    };
    await tx.runAsync(
      "UPDATE categories SET name = ?, type = ?, icon = ?, updated_at = ?, sync_status = ? WHERE id = ?",
      record.name,
      record.type,
      record.icon,
      record.updated_at,
      record.sync_status,
      id,
    );
    return record;
  });
}
export async function archiveCategory(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  if (protectedCategoryIds.has(id))
    throw new Error("Other must remain available for transaction entry.");
  await archiveRecord(db, "categories", id);
}
export async function restoreCategory(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await restoreRecord(db, "categories", id);
}
export async function getCategories(
  db: SQLiteDatabase,
  options: { includeArchived?: boolean; type?: TransactionType } = {},
): Promise<Category[]> {
  return db.getAllAsync<Category>(
    `SELECT * FROM categories WHERE deleted_at IS NULL ${options.includeArchived ? "" : "AND is_archived = 0"} ${options.type ? "AND type IN (?, 'both')" : ""} ORDER BY name COLLATE NOCASE, id`,
    options.type ? [options.type] : [],
  );
}
export function getExpenseCategories(db: SQLiteDatabase) {
  return getCategories(db, { type: "expense" });
}
export function getIncomeCategories(db: SQLiteDatabase) {
  return getCategories(db, { type: "income" });
}
