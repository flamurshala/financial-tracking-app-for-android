import type { SQLiteDatabase } from "expo-sqlite";
import type {
  DateRange,
  StatisticsPeriod,
  TransactionFilters,
  MonthComparison,
} from "../types/statistics";
import { calendarDateToPicker } from "../utils/dates";
import {
  calendarDayCount,
  getPeriodRange,
  movePeriod,
  validateRange,
} from "../utils/periods";
import { sumCents } from "../utils/currency";
import {
  getCategoryExpenseBreakdown,
  getCategoryIncomeBreakdown,
  getDailyTotals,
  getLargestTransaction,
  getMonthlyTotalsForYear,
  getPeriodSummary,
  mostUsedCategory,
  roundedAverageCents,
} from "../database/repositories/statisticsRepository";
import { withWriteTransaction } from "../database/repositories/shared";
export async function getPreviousMonthComparison(
  db: SQLiteDatabase,
  anchor: string,
  currentExpenses: number,
  filters: TransactionFilters = {},
): Promise<MonthComparison> {
  const previous = await getPeriodSummary(
    db,
    getPeriodRange("month", movePeriod("month", anchor, -1)),
    filters,
  );
  const difference = sumCents([currentExpenses, -previous.expenses]);
  return {
    previousExpenses: previous.expenses,
    difference,
    percentageChange: previous.expenses
      ? (difference / previous.expenses) * 100
      : null,
  };
}
export async function getStatisticsReport(
  db: SQLiteDatabase,
  period: StatisticsPeriod,
  anchor: string,
  range: DateRange,
  filters: TransactionFilters = {},
) {
  validateRange(range);
  return withWriteTransaction(db, async (tx) => {
    const summary = await getPeriodSummary(tx, range, filters);
    const expenses = await getCategoryExpenseBreakdown(tx, range, filters);
    const income = await getCategoryIncomeBreakdown(tx, range, filters);
    const largestExpense = await getLargestTransaction(
      tx,
      range,
      "expense",
      filters,
    );
    const largestIncome = await getLargestTransaction(
      tx,
      range,
      "income",
      filters,
    );
    const days = calendarDayCount(range);
    const daily =
      period === "week" ? await getDailyTotals(tx, range, filters) : [];
    const monthly =
      period === "year"
        ? await getMonthlyTotalsForYear(
            tx,
            calendarDateToPicker(anchor).getFullYear(),
            filters,
          )
        : [];
    const bySpending = [...daily].sort(
      (a, b) => b.expenses - a.expenses || a.date.localeCompare(b.date),
    );
    const comparison =
      period === "month"
        ? await getPreviousMonthComparison(
            tx,
            anchor,
            summary.expenses,
            filters,
          )
        : null;
    return {
      summary,
      expenses,
      income,
      largestExpense,
      largestIncome,
      days,
      averageDailyCents: roundedAverageCents(summary.expenses, days),
      averageMonthlyCents: roundedAverageCents(summary.expenses, 12),
      mostUsed: mostUsedCategory(expenses),
      highestDay: bySpending[0] ?? null,
      lowestDay:
        [...daily].sort(
          (a, b) => a.expenses - b.expenses || a.date.localeCompare(b.date),
        )[0] ?? null,
      highestMonth:
        [...monthly].sort(
          (a, b) => b.expenses - a.expenses || a.month.localeCompare(b.month),
        )[0] ?? null,
      daily,
      monthly,
      comparison,
    };
  });
}
