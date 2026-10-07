import type { SQLiteDatabase } from "expo-sqlite";
import type { Account, Category } from "../../types/finance";
import type {
  CsvAccountMapping,
  CsvImportBatch,
  CsvImportPreview,
  CsvImportRow,
} from "../../types/csvImport";
import { validateImportRows } from "../../utils/csvImport";
import { newRecord, withReadSnapshot, withWriteTransaction } from "./shared";
import { createCategory } from "./categoryRepository";
import { createTransactionInTransaction } from "./transactionRepository";
import { getAccountBalance } from "./accountRepository";
import { sumCents } from "../../utils/currency";
export class DuplicateImportError extends Error {
  constructor() {
    super(
      "This file was already imported. Review the duplicate warning before importing again.",
    );
  }
}
export async function previousImport(
  db: SQLiteDatabase,
  hash: string,
): Promise<CsvImportBatch | null> {
  return db.getFirstAsync<CsvImportBatch>(
    "SELECT * FROM import_batches WHERE content_hash=? ORDER BY imported_at DESC,id DESC LIMIT 1",
    hash,
  );
}
async function resolve(
  db: SQLiteDatabase,
  rows: CsvImportRow[],
  mappings: CsvAccountMapping,
) {
  const accounts = await db.getAllAsync<Account>(
    "SELECT * FROM accounts WHERE deleted_at IS NULL",
  );
  const categories = await db.getAllAsync<Category>(
    "SELECT * FROM categories WHERE deleted_at IS NULL",
  );
  return validateImportRows(rows, accounts, categories, mappings);
}
export function previewImport(
  db: SQLiteDatabase,
  rows: CsvImportRow[],
  mappings: CsvAccountMapping,
) {
  return withReadSnapshot(db, (tx) => resolve(tx, rows, mappings));
}
const signature = (preview: CsvImportPreview) =>
  JSON.stringify({
    rows: preview.rows,
    errors: preview.errors,
    unknownCategories: preview.unknownCategories,
  });
/** Re-resolve the exact confirmed preview under the same lock as categories/rows/batch metadata. */
export async function commitImport(
  db: SQLiteDatabase,
  request: {
    raw: CsvImportRow[];
    mappings: CsvAccountMapping;
    preview: CsvImportPreview;
    fileName: string;
    hash: string;
    createCategories: boolean;
    allowDuplicate: boolean;
  },
  progress: (count: number) => void = () => {},
  check: () => void = () => {},
) {
  if (!/^[a-f0-9]{64}$/.test(request.hash))
    throw new Error("Invalid import fingerprint. Choose the file again.");
  return withWriteTransaction(db, async (tx) => {
    check();
    if ((await previousImport(tx, request.hash)) && !request.allowDuplicate)
      throw new DuplicateImportError();
    const fresh = await resolve(tx, request.raw, request.mappings);
    if (signature(fresh) !== signature(request.preview))
      throw new Error(
        "Accounts or categories changed. Refresh the preview before importing.",
      );
    if (!fresh.rows.length)
      throw new Error("There are no valid rows to import.");
    if (fresh.unknownCategories.length && !request.createCategories)
      throw new Error("Approve the new categories before importing.");
    if (fresh.unknownCategories.length > 100)
      throw new Error(
        "Correct category names or split the file: create at most 100 new categories per import.",
      );
    for (const id of new Set(fresh.rows.map((row) => row.input.account_id))) {
      sumCents([
        await getAccountBalance(tx, id),
        ...fresh.rows
          .filter((row) => row.input.account_id === id)
          .map((row) =>
            row.input.type === "income"
              ? row.input.amount_cents
              : -row.input.amount_cents,
          ),
      ]);
    }
    const created = new Map<string, string>();
    for (const category of fresh.unknownCategories) {
      check();
      created.set(
        category.key,
        (await createCategory(tx, { name: category.name, type: category.type }))
          .id,
      );
    }
    for (let index = 0; index < fresh.rows.length; index++) {
      check();
      const row = fresh.rows[index];
      await createTransactionInTransaction(tx, {
        ...row.input,
        category_id:
          row.input.category_id ?? created.get(row.categoryKey) ?? null,
      });
      if ((index + 1) % 100 === 0) {
        progress(index + 1);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    check();
    const batch: CsvImportBatch = {
      id: newRecord().id,
      file_name: request.fileName.slice(0, 255) || "transactions.csv",
      content_hash: request.hash,
      imported_at: new Date().toISOString(),
      row_count: fresh.rows.length,
      skipped_count: new Set(fresh.errors.map((error) => error.rowNumber)).size,
    };
    await tx.runAsync(
      "INSERT INTO import_batches(id,file_name,content_hash,imported_at,row_count,skipped_count) VALUES(?,?,?,?,?,?)",
      batch.id,
      batch.file_name,
      batch.content_hash,
      batch.imported_at,
      batch.row_count,
      batch.skipped_count,
    );
    progress(batch.row_count);
    return {
      batch,
      expenseCents: fresh.expenseCents,
      incomeCents: fresh.incomeCents,
    };
  });
}
