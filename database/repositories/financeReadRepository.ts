import type { SQLiteDatabase } from "expo-sqlite";
import type {
  Account,
  Transaction,
  TransactionType,
} from "../../types/finance";
import type { TransactionFilters } from "../../types/statistics";
import { buildTransactionWhere } from "./filterSql";
export interface AccountBalance extends Account {
  balance_cents: number;
}
export interface TransactionView extends Transaction {
  account_name: string;
  category_name: string | null;
}
export async function getAccountBalances(
  db: SQLiteDatabase,
): Promise<AccountBalance[]> {
  const rows = await db.getAllAsync<Account & { ledger_cents: string }>(
    "SELECT a.*, CAST(COALESCE(SUM(CASE t.type WHEN 'income' THEN t.amount_cents ELSE -t.amount_cents END),0) AS TEXT) AS ledger_cents FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id AND t.deleted_at IS NULL WHERE a.deleted_at IS NULL GROUP BY a.id ORDER BY a.is_archived,a.name COLLATE NOCASE,a.id",
  );
  return rows.map(({ ledger_cents, ...account }) => {
    const total = BigInt(ledger_cents) + BigInt(account.initial_balance_cents);
    if (
      total > BigInt(Number.MAX_SAFE_INTEGER) ||
      total < BigInt(Number.MIN_SAFE_INTEGER)
    )
      throw new Error("Calculated amount exceeds safe integer cents");
    return { ...account, balance_cents: Number(total) };
  });
}
export async function getTransactionViews(
  db: SQLiteDatabase,
  options: TransactionFilters & { limit?: number; offset?: number } = {},
): Promise<TransactionView[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw new Error("Invalid pagination");
  const { where, params } = buildTransactionWhere(options);
  return db.getAllAsync<TransactionView>(
    `SELECT t.*, a.name AS account_name, c.name AS category_name FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id ${where} ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}
export async function getRecentDescriptions(
  db: SQLiteDatabase,
  type: TransactionType,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ description: string }>(
    "SELECT description FROM transactions WHERE type = ? AND deleted_at IS NULL AND is_balance_adjustment = 0 ORDER BY created_at DESC, id DESC LIMIT 40",
    type,
  );
  return [...new Set(rows.map((row) => row.description))].slice(0, 4);
}
