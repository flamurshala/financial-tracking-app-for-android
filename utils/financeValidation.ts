import { z } from "zod";
import { calendarDateSchema } from "./dates";
export const idSchema = z.uuid();
export const centsSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
export const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["cash", "bank", "card", "savings", "other"]),
  currency: z.literal("EUR").default("EUR"),
  initial_balance_cents: centsSchema,
});
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["expense", "income", "both"]),
  icon: z.string().trim().min(1).max(100).nullable().default(null),
});
export const transactionInputSchema = z
  .object({
    account_id: idSchema,
    category_id: idSchema.nullable(),
    type: z.enum(["expense", "income"]),
    amount_cents: centsSchema.positive(),
    description: z.string().max(2000).default(""),
    transaction_date: calendarDateSchema,
    is_balance_adjustment: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (!value.is_balance_adjustment && value.category_id === null)
      context.addIssue({
        code: "custom",
        path: ["category_id"],
        message: "Ordinary transactions require a category",
      });
    if (value.is_balance_adjustment && value.category_id !== null)
      context.addIssue({
        code: "custom",
        path: ["category_id"],
        message: "Balance adjustments do not use an income or expense category",
      });
  });
export type AccountInput = z.input<typeof accountInputSchema>;
export type CategoryInput = z.input<typeof categoryInputSchema>;
export type TransactionInput = z.input<typeof transactionInputSchema>;
