import type { SQLiteDatabase } from "expo-sqlite";
import type {
  Account,
  Transaction,
  TransactionType,
} from "../../types/finance";
import { sumCents } from "../../utils/currency";
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
  const rows = await db.getAllAsync<
    Account & {
      amount_cents: number | null;
      transaction_type: TransactionType | null;
    }
  >(
    `SELECT a.*, t.amount_cents, t.type AS transaction_type FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL WHERE a.deleted_at IS NULL ORDER BY a.is_archived, a.name COLLATE NOCASE, a.id`,
  );
  const grouped = new Map<string, { account: Account; amounts: number[] }>();
  for (const row of rows) {
    const { amount_cents, transaction_type, ...account } = row;
    let group = grouped.get(row.id);
    if (!group) {
      group = { account, amounts: [row.initial_balance_cents] };
      grouped.set(row.id, group);
    }
    if (amount_cents !== null)
      group.amounts.push(
        transaction_type === "income" ? amount_cents : -amount_cents,
      );
  }
  return [...grouped.values()].map(({ account, amounts }) => ({
    ...account,
    balance_cents: sumCents(amounts),
  }));
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
