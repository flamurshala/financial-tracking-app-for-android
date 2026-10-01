import type { SQLiteDatabase } from "expo-sqlite";
import { addDays, format } from "date-fns";
import type {
  CategoryBreakdown,
  DateRange,
  DailyTotal,
  MonthlyTotal,
  PeriodSummary,
  TransactionFilters,
} from "../../types/statistics";
import type { TransactionType } from "../../types/finance";
import { buildTransactionWhere } from "./filterSql";
import {
  getTransactionViews,
  type TransactionView,
} from "./financeReadRepository";
import { sumCents, validateCents } from "../../utils/currency";
import { calendarDateToPicker, localCalendarDate } from "../../utils/dates";
import { validateRange } from "../../utils/periods";
export function roundedAverageCents(total: number, count: number): number {
  validateCents(total);
  if (!Number.isSafeInteger(count) || count < 0 || total < 0)
    throw new Error("Invalid average inputs");
  if (!count) return 0;
  return Number((BigInt(total) + BigInt(count) / 2n) / BigInt(count));
}
function reportWhere(range: DateRange, filters: TransactionFilters = {}) {
  validateRange(range);
  return buildTransactionWhere({
    ...filters,
    ...range,
    excludeAdjustments: true,
  });
}
export async function getPeriodSummary(
  db: SQLiteDatabase,
  range: DateRange,
  filters: TransactionFilters = {},
): Promise<PeriodSummary> {
  const { where, params } = reportWhere(range, filters);
  const row = await db.getFirstAsync<{
    income: number;
    expenses: number;
    incomeCount: number;
    expenseCount: number;
  }>(
    `SELECT COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income, COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expenses, COUNT(CASE WHEN t.type = 'income' THEN 1 END) AS incomeCount, COUNT(CASE WHEN t.type = 'expense' THEN 1 END) AS expenseCount FROM transactions t ${where}`,
    params,
  );
  if (!row) throw new Error("Could not calculate period totals");
  validateCents(row.income);
  validateCents(row.expenses);
  return {
    ...row,
    net: sumCents([row.income, -row.expenses]),
    transactionCount: row.incomeCount + row.expenseCount,
  };
}
async function categoryBreakdown(
  db: SQLiteDatabase,
  range: DateRange,
  type: TransactionType,
  filters: TransactionFilters,
): Promise<CategoryBreakdown[]> {
  const { where, params } = reportWhere(range, { ...filters, type });
  const rows = await db.getAllAsync<{
    categoryId: string;
    name: string;
    cents: number;
    count: number;
  }>(
    `SELECT t.category_id AS categoryId, COALESCE(c.name, 'Category unavailable') AS name, SUM(t.amount_cents) AS cents, COUNT(*) AS count FROM transactions t LEFT JOIN categories c ON c.id = t.category_id ${where} GROUP BY t.category_id ORDER BY cents DESC, name COLLATE NOCASE, t.category_id`,
    params,
  );
  const total = sumCents(rows.map((row) => row.cents));
  return rows.map((row) => ({
    ...row,
    percentage: total ? (row.cents / total) * 100 : 0,
  }));
}
export function getCategoryExpenseBreakdown(
  db: SQLiteDatabase,
  range: DateRange,
  filters: TransactionFilters = {},
) {
  return categoryBreakdown(db, range, "expense", filters);
}
export function getCategoryIncomeBreakdown(
  db: SQLiteDatabase,
  range: DateRange,
  filters: TransactionFilters = {},
) {
  return categoryBreakdown(db, range, "income", filters);
}
export async function getDailyTotals(
  db: SQLiteDatabase,
  range: DateRange,
  filters: TransactionFilters = {},
): Promise<DailyTotal[]> {
  const { where, params } = reportWhere(range, filters);
  const rows = await db.getAllAsync<DailyTotal>(
    `SELECT t.transaction_date AS date, COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income, COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expenses FROM transactions t ${where} GROUP BY t.transaction_date ORDER BY t.transaction_date`,
    params,
  );
  const map = new Map(
    rows.map((row) => {
      validateCents(row.income);
      validateCents(row.expenses);
      return [row.date, row];
    }),
  );
  const result: DailyTotal[] = [];
  for (
    let date = calendarDateToPicker(range.fromDate);
    localCalendarDate(date) <= range.toDate;
    date = addDays(date, 1)
  ) {
    const key = localCalendarDate(date);
    result.push(map.get(key) ?? { date: key, income: 0, expenses: 0 });
  }
  return result;
}
export async function getMonthlyTotalsForYear(
  db: SQLiteDatabase,
  year: number,
  filters: TransactionFilters = {},
): Promise<MonthlyTotal[]> {
  if (!Number.isInteger(year) || year < 1 || year > 9999)
    throw new Error("Invalid year");
  const prefix = String(year).padStart(4, "0");
  const { where, params } = reportWhere(
    { fromDate: `${prefix}-01-01`, toDate: `${prefix}-12-31` },
    filters,
  );
  const rows = await db.getAllAsync<MonthlyTotal>(
    `SELECT substr(t.transaction_date, 1, 7) AS month, COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income, COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expenses FROM transactions t ${where} GROUP BY month ORDER BY month`,
    params,
  );
  const map = new Map(
    rows.map((row) => {
      validateCents(row.income);
      validateCents(row.expenses);
      return [row.month, row];
    }),
  );
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${prefix}-${String(index + 1).padStart(2, "0")}`;
    return map.get(month) ?? { month, income: 0, expenses: 0 };
  });
}
export async function getLargestTransaction(
  db: SQLiteDatabase,
  range: DateRange,
  type: TransactionType,
  filters: TransactionFilters = {},
): Promise<TransactionView | null> {
  const { where, params } = reportWhere(range, { ...filters, type });
  return db.getFirstAsync<TransactionView>(
    `SELECT t.*, a.name AS account_name, c.name AS category_name FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id ${where} ORDER BY t.amount_cents DESC, t.transaction_date DESC, t.id LIMIT 1`,
    params,
  );
}
export function mostUsedCategory(
  rows: CategoryBreakdown[],
): CategoryBreakdown | null {
  return (
    [...rows].sort(
      (a, b) =>
        b.count - a.count || b.cents - a.cents || a.name.localeCompare(b.name),
    )[0] ?? null
  );
}
export function getTransactionsForCategory(
  db: SQLiteDatabase,
  range: DateRange,
  categoryId: string,
  type: TransactionType,
  options: { limit?: number; offset?: number; accountId?: string } = {},
) {
  validateRange(range);
  return getTransactionViews(db, {
    ...options,
    ...range,
    categoryId,
    type,
    excludeAdjustments: true,
  });
}
export function monthName(value: string) {
  return format(calendarDateToPicker(`${value}-01`), "MMM");
}
