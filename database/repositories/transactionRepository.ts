import type { SQLiteDatabase } from "expo-sqlite";
import type { Transaction, TransactionType } from "../../types/finance";
import {
  transactionInputSchema,
  type TransactionInput,
} from "../../utils/financeValidation";
import { calendarDateSchema } from "../../utils/dates";
import { sumCents } from "../../utils/currency";
import { getAccountById } from "./accountRepository";
import { getCategoryById } from "./categoryRepository";
import { newRecord, validateId, withWriteTransaction } from "./shared";
import { normalizeSearchText } from "../../utils/search";
/** Reference checks and writes share an exclusive transaction to prevent archive races. */
async function validateReferences(
  db: SQLiteDatabase,
  data: ReturnType<typeof transactionInputSchema.parse>,
  current?: Transaction,
) {
  const account = await getAccountById(db, data.account_id);
  if (!account || (account.is_archived && current?.account_id !== account.id))
    throw new Error("Choose an active account");
  if (data.category_id) {
    const category = await getCategoryById(db, data.category_id);
    if (
      !category ||
      (category.is_archived && current?.category_id !== category.id)
    )
      throw new Error("Choose an active category");
    if (category.type !== "both" && category.type !== data.type)
      throw new Error("Category does not match transaction type");
    if (!data.description.trim()) data.description = category.name;
  }
  if (!data.description.trim()) data.description = "Balance Adjustment";
}
export async function createTransaction(
  db: SQLiteDatabase,
  input: TransactionInput,
): Promise<Transaction> {
  return withWriteTransaction(db, (tx) =>
    createTransactionInTransaction(tx, input),
  );
}
/** Caller owns the exclusive transaction; useful for atomic multi-record workflows. */
export async function createTransactionInTransaction(
  db: SQLiteDatabase,
  input: TransactionInput,
): Promise<Transaction> {
  const data = transactionInputSchema.parse(input);
  await validateReferences(db, data);
  const record: Transaction = {
    ...newRecord(),
    ...data,
    is_balance_adjustment: data.is_balance_adjustment ? 1 : 0,
  };
  await db.runAsync(
    "INSERT INTO transactions (id, account_id, category_id, type, amount_cents, description, transaction_date, is_balance_adjustment, created_at, updated_at, description_search) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    record.id,
    record.account_id,
    record.category_id,
    record.type,
    record.amount_cents,
    record.description,
    record.transaction_date,
    record.is_balance_adjustment,
    record.created_at,
    record.updated_at,
    normalizeSearchText(record.description),
  );
  return record;
}
/** Full replacement of editable fields; no resurrection of deleted records. */
export async function updateTransaction(
  db: SQLiteDatabase,
  id: string,
  input: TransactionInput,
): Promise<Transaction> {
  validateId(id);
  const data = transactionInputSchema.parse(input);
  return withWriteTransaction(db, async (tx) => {
    const current = await getTransactionById(tx, id);
    if (!current) throw new Error("Transaction not found");
    await validateReferences(tx, data, current);
    const record: Transaction = {
      ...current,
      ...data,
      is_balance_adjustment: data.is_balance_adjustment ? 1 : 0,
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    };
    await tx.runAsync(
      "UPDATE transactions SET account_id = ?, category_id = ?, type = ?, amount_cents = ?, description = ?, transaction_date = ?, is_balance_adjustment = ?, updated_at = ?, sync_status = ?, description_search = ? WHERE id = ?",
      record.account_id,
      record.category_id,
      record.type,
      record.amount_cents,
      record.description,
      record.transaction_date,
      record.is_balance_adjustment,
      record.updated_at,
      record.sync_status,
      normalizeSearchText(record.description),
      id,
    );
    return record;
  });
}
export async function softDeleteTransaction(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  validateId(id);
  const timestamp = new Date().toISOString();
  const result = await db.runAsync(
    "UPDATE transactions SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ? AND deleted_at IS NULL",
    timestamp,
    timestamp,
    "pending",
    id,
  );
  if (!result.changes) {
    const existing = await getTransactionById(db, id, true);
    if (!existing) throw new Error("Transaction not found");
  }
}
export async function getTransactionById(
  db: SQLiteDatabase,
  id: string,
  includeDeleted = false,
): Promise<Transaction | null> {
  validateId(id);
  return db.getFirstAsync<Transaction>(
    `SELECT * FROM transactions WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
    id,
  );
}
export interface TransactionQuery {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  fromDate?: string;
  toDate?: string;
  includeDeleted?: boolean;
  includeAdjustments?: boolean;
  limit?: number;
  offset?: number;
}
function queryFilters(query: TransactionQuery): {
  where: string;
  params: (string | number)[];
} {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (!query.includeDeleted) clauses.push("deleted_at IS NULL");
  if (query.includeAdjustments === false)
    clauses.push("is_balance_adjustment = 0");
  for (const [column, value] of [
    ["account_id", query.accountId],
    ["category_id", query.categoryId],
  ] as const) {
    if (value !== undefined) {
      validateId(value);
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (query.type !== undefined) {
    if (query.type !== "income" && query.type !== "expense")
      throw new Error("Invalid transaction type");
    clauses.push("type = ?");
    params.push(query.type);
  }
  if (query.fromDate !== undefined) {
    calendarDateSchema.parse(query.fromDate);
    clauses.push("transaction_date >= ?");
    params.push(query.fromDate);
  }
  if (query.toDate !== undefined) {
    calendarDateSchema.parse(query.toDate);
    clauses.push("transaction_date <= ?");
    params.push(query.toDate);
  }
  if (query.fromDate && query.toDate && query.fromDate > query.toDate)
    throw new Error("Date range is reversed");
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}
export async function getTransactions(
  db: SQLiteDatabase,
  query: TransactionQuery = {},
): Promise<Transaction[]> {
  const { where, params } = queryFilters(query);
  const limit = query.limit ?? 100;
  const offset = query.offset ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw new Error("Invalid pagination");
  return db.getAllAsync<Transaction>(
    `SELECT * FROM transactions ${where} ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}
export function getTransactionsByDateRange(
  db: SQLiteDatabase,
  fromDate: string,
  toDate: string,
  query: TransactionQuery = {},
) {
  return getTransactions(db, { ...query, fromDate, toDate });
}
export function getTransactionsByCategory(
  db: SQLiteDatabase,
  categoryId: string,
  query: TransactionQuery = {},
) {
  return getTransactions(db, { ...query, categoryId });
}
export type TotalQuery = Pick<
  TransactionQuery,
  "accountId" | "categoryId" | "fromDate" | "toDate"
>;
async function getTotal(
  db: SQLiteDatabase,
  type: TransactionType,
  query: TotalQuery,
): Promise<number> {
  // Totals are unpaginated, ignore deleted records, and exclude balance corrections.
  const { where, params } = queryFilters({
    ...query,
    type,
    includeDeleted: false,
    includeAdjustments: false,
  });
  const rows = await db.getAllAsync<{ amount_cents: number }>(
    `SELECT amount_cents FROM transactions ${where}`,
    params,
  );
  return sumCents(rows.map((row) => row.amount_cents));
}
export function getTotalIncome(db: SQLiteDatabase, query: TotalQuery = {}) {
  return getTotal(db, "income", query);
}
export function getTotalExpenses(db: SQLiteDatabase, query: TotalQuery = {}) {
  return getTotal(db, "expense", query);
}
