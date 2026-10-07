import { z } from "zod";
import { decimalToCents } from "./currency";
import { calendarDateSchema } from "./dates";
export function decimalField(allowZero = false, allowNegative = false) {
  return z.string().superRefine((value, context) => {
    try {
      const raw =
        allowNegative && value.trim().startsWith("-")
          ? value.trim().slice(1)
          : value;
      const cents = decimalToCents(raw);
      if (!allowZero && cents === 0)
        context.addIssue({
          code: "custom",
          message: "Enter an amount greater than zero",
        });
    } catch {
      context.addIssue({
        code: "custom",
        message:
          "Enter a valid amount with up to two decimal places, without grouping separators",
      });
    }
  });
}
export function signedDecimalToCents(value: string): number {
  const text = value.trim();
  return text.startsWith("-")
    ? -decimalToCents(text.slice(1))
    : decimalToCents(text);
}
export const entryFormSchema = z
  .object({
    type: z.enum(["expense", "income"]),
    amount: decimalField(),
    description: z.string().max(2000, "Use at most 2000 characters"),
    account_id: z.uuid("Choose an account"),
    category_id: z.string(),
    transaction_date: calendarDateSchema,
    is_balance_adjustment: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      !value.is_balance_adjustment &&
      !z.uuid().safeParse(value.category_id).success
    )
      context.addIssue({
        code: "custom",
        path: ["category_id"],
        message: "Choose a category",
      });
  });
export type EntryFormValues = z.infer<typeof entryFormSchema>;
export function resetForAnother(values: EntryFormValues): EntryFormValues {
  return { ...values, amount: "", description: "", category_id: "" };
}
