import { z } from "zod";
import type { TransactionFilters } from "../../types/statistics";
import { calendarDateSchema } from "../../utils/dates";
import { centsSchema, idSchema } from "../../utils/financeValidation";
import { searchTokens } from "../../utils/search";
const schema = z
  .object({
    type: z.enum(["expense", "income"]).optional(),
    categoryId: idSchema.optional(),
    accountId: idSchema.optional(),
    fromDate: calendarDateSchema.optional(),
    toDate: calendarDateSchema.optional(),
    minAmountCents: centsSchema.nonnegative().optional(),
    maxAmountCents: centsSchema.nonnegative().optional(),
    search: z.string().max(500).optional(),
    excludeAdjustments: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.fromDate && value.toDate && value.fromDate > value.toDate)
      context.addIssue({
        code: "custom",
        message: "Start date must be on or before end date",
      });
    if (
      value.minAmountCents !== undefined &&
      value.maxAmountCents !== undefined &&
      value.minAmountCents > value.maxAmountCents
    )
      context.addIssue({
        code: "custom",
        message: "Minimum amount must not exceed maximum amount",
      });
  });
/** Only trusted column names are interpolated; every user value is bound. */
export function buildTransactionWhere(input: TransactionFilters = {}) {
  const filters = schema.parse(input);
  const clauses = ["t.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  if (filters.excludeAdjustments) clauses.push("t.is_balance_adjustment = 0");
  for (const [column, operator, value] of [
    ["type", "=", filters.type],
    ["category_id", "=", filters.categoryId],
    ["account_id", "=", filters.accountId],
    ["transaction_date", ">=", filters.fromDate],
    ["transaction_date", "<=", filters.toDate],
    ["amount_cents", ">=", filters.minAmountCents],
    ["amount_cents", "<=", filters.maxAmountCents],
  ] as const) {
    if (value !== undefined) {
      clauses.push(`t.${column} ${operator} ?`);
      params.push(value);
    }
  }
  for (const token of searchTokens(filters.search ?? "")) {
    clauses.push("t.description_search LIKE ? ESCAPE '\\'");
    params.push(`%${token.replace(/[\\%_]/g, "\\$&")}%`);
  }
  return { where: `WHERE ${clauses.join(" AND ")}`, params };
}
