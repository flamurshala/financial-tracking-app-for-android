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
  const accounts = await db.getAllAsync<Account>("SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY is_archived,name COLLATE NOCASE,id");
  const ledger = await db.getAllAsync<{ account_id: string; cents: number }>(`SELECT account_id, CASE type WHEN 'income' THEN amount_cents ELSE -amount_cents END AS cents FROM transactions WHERE deleted_at IS NULL
    UNION ALL SELECT from_account_id,-amount_cents FROM transfers WHERE deleted_at IS NULL
    UNION ALL SELECT to_account_id,amount_cents FROM transfers WHERE deleted_at IS NULL`);
  const totals = new Map<string, bigint>();
  for (const row of ledger) totals.set(row.account_id,(totals.get(row.account_id) ?? 0n)+BigInt(row.cents));
  return accounts.map(account => {
    const total = BigInt(account.initial_balance_cents)+(totals.get(account.id) ?? 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Calculated amount exceeds safe integer cents');
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
