import type { TransactionType } from "./finance";
export type StatisticsPeriod = "day" | "week" | "month" | "year" | "custom";
export interface DateRange {
  fromDate: string;
  toDate: string;
}
export interface TransactionFilters {
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  search?: string;
  excludeAdjustments?: boolean;
}
export interface PeriodSummary {
  income: number;
  expenses: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
}
export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  cents: number;
  count: number;
  percentage: number;
}
export interface DailyTotal {
  date: string;
  income: number;
  expenses: number;
}
export interface MonthlyTotal {
  month: string;
  income: number;
  expenses: number;
}
export interface MonthComparison {
  previousExpenses: number;
  difference: number;
  percentageChange: number | null;
}
