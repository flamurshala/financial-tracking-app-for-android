import type { TransactionView } from "../database/repositories/financeReadRepository";
import { centsToDecimal } from "./currency";
/** Quote every cell; prefix untrusted spreadsheet formulas without changing source data. */
export function csvCell(value: string, untrusted = false): string {
  const safe =
    untrusted && /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export const csvHeader =
  "\uFEFF" +
  [
    "date",
    "type",
    "amount",
    "currency",
    "description",
    "category",
    "account",
    "is_balance_adjustment",
    "created_at",
    "updated_at",
  ]
    .map((value) => csvCell(value))
    .join(",") +
  "\r\n";
export function transactionCsv(row: TransactionView): string {
  return (
    [
      csvCell(row.transaction_date),
      csvCell(row.type),
      csvCell(centsToDecimal(row.amount_cents)),
      csvCell("EUR"),
      csvCell(row.description, true),
      csvCell(row.category_name ?? "", true),
      csvCell(row.account_name, true),
      csvCell(String(Boolean(row.is_balance_adjustment))),
      csvCell(row.created_at),
      csvCell(row.updated_at),
    ].join(",") + "\r\n"
  );
}
