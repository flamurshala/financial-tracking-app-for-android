import * as Papa from "papaparse";
import type { Account, Category } from "../types/finance";
import type {
  CsvAccountMapping,
  CsvImportRow,
  CsvImportPreview,
} from "../types/csvImport";
import { calendarDateSchema } from "./dates";
import { decimalToCents, sumCents } from "./currency";
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10000;
export const importHeaders = [
  "Date",
  "Type",
  "Amount",
  "Description",
  "Category",
  "Account",
];
export const importTemplate =
  "\uFEFFDate,Type,Amount,Description,Category,Account\r\n2026-10-01,Expense,1.00,Coffee,Coffee,Cash\r\n2026-10-01,Expense,8.50,,Groceries,Cash\r\n2026-10-02,Expense,30.00,Fuel,Fuel,Card\r\n2026-10-03,Income,50.00,Client payment,Client Payment,Bank\r\n";
export const csvNameKey = (value: string) =>
  value.trim().normalize("NFC").toLowerCase();
export function parseImportCsv(text: string): CsvImportRow[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error("Choose a CSV no larger than 5 MB.");
  if (text.includes("\u0000") || text.includes("\uFFFD"))
    throw new Error("Use a valid UTF-8 CSV file.");
  const parsed = Papa.parse<string[]>(
    text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"),
    {
      delimiter: ",",
      newline: "\n",
      dynamicTyping: false,
      skipEmptyLines: false,
    },
  );
  if (parsed.errors.length)
    throw new Error(
      `Malformed CSV near record ${(parsed.errors[0].row ?? 0) + 1}. Check quoting and delimiters.`,
    );
  const header = parsed.data[0]?.map(csvNameKey) ?? [];
  if (!header.length || !header.some(Boolean))
    throw new Error("The CSV is empty.");
  if (new Set(header).size !== header.length)
    throw new Error("The CSV has duplicate column headers.");
  for (const name of importHeaders)
    if (!header.includes(name.toLowerCase()))
      throw new Error(`Missing ${name} column. Use the import template.`);
  if (
    header.some(
      (name) =>
        !importHeaders.some((expected) => expected.toLowerCase() === name),
    )
  )
    throw new Error(
      "Use the six-column import template. Export/backup columns are not an import format.",
    );
  const rows: CsvImportRow[] = [];
  for (let i = 1; i < parsed.data.length; i++) {
    const cells = parsed.data[i];
    if (cells.length === 1 && !cells[0].trim()) continue;
    if (cells.length !== header.length)
      throw new Error(
        `Record ${i + 1} has the wrong number of columns. Check quoted commas/newlines.`,
      );
    const get = (name: string) => cells[header.indexOf(name)] ?? "";
    rows.push({
      rowNumber: i + 1,
      date: get("date").trim(),
      type: get("type").trim(),
      amount: get("amount").trim(),
      description: get("description"),
      category: get("category").trim(),
      account: get("account").trim(),
    });
    if (rows.length > MAX_IMPORT_ROWS)
      throw new Error("Import at most 10,000 transactions per file.");
  }
  if (!rows.length) throw new Error("The CSV contains no transaction rows.");
  return rows;
}
/** No writes. Ambiguous or archived references require correction rather than guesses. */
export function validateImportRows(
  raw: CsvImportRow[],
  accounts: Account[],
  categories: Category[],
  mappings: CsvAccountMapping = {},
): CsvImportPreview {
  if (raw.length > MAX_IMPORT_ROWS)
    throw new Error("Import at most 10,000 transactions per file.");
  const result: CsvImportPreview = {
    rows: [],
    errors: [],
    unknownAccounts: [],
    unknownCategories: [],
    expenseCents: 0,
    incomeCents: 0,
  };
  const missingAccounts = new Set<string>();
  const newCategories = new Map<
    string,
    { key: string; name: string; type: "expense" | "income" | "both" }
  >();
  for (const row of raw) {
    const error = (field: string, problem: string) =>
      result.errors.push({ rowNumber: row.rowNumber, field, problem });
    const before = result.errors.length;
    if (!calendarDateSchema.safeParse(row.date).success)
      error("Date", "Expected a real YYYY-MM-DD calendar date.");
    const type = row.type.toLowerCase();
    if (type !== "expense" && type !== "income")
      error("Type", "Use Expense or Income.");
    let cents = 0;
    try {
      cents = decimalToCents(row.amount);
      if (cents <= 0) throw new Error();
    } catch {
      error(
        "Amount",
        "Use a positive decimal EUR amount with up to two decimal places, without grouping.",
      );
    }
    if (row.description.length > 2000)
      error("Description", "Use at most 2000 characters.");
    if (!row.category || row.category.length > 100)
      error("Category", "Enter a category name of 1–100 characters.");
    if (!row.account || row.account.length > 100)
      error("Account", "Enter an account name of 1–100 characters.");
    const accountKey = csvNameKey(row.account);
    const mapping = Object.prototype.hasOwnProperty.call(mappings, accountKey)
      ? mappings[accountKey]
      : undefined;
    const foundAccounts = accounts.filter(
      (account) =>
        !account.deleted_at &&
        !account.is_archived &&
        (mapping
          ? account.id === mapping
          : csvNameKey(account.name) === accountKey),
    );
    const account = foundAccounts.length === 1 ? foundAccounts[0] : null;
    if (!account && row.account) {
      missingAccounts.add(row.account);
      error(
        "Account",
        foundAccounts.length > 1
          ? "Name is ambiguous; map it to one existing account."
          : "Account not found or archived; map it to an active account.",
      );
    }
    const categoryKey = csvNameKey(row.category);
    const named = categories.filter(
      (category) =>
        !category.deleted_at && csvNameKey(category.name) === categoryKey,
    );
    const matching = named.filter(
      (category) =>
        !category.is_archived &&
        (category.type === "both" || category.type === type),
    );
    if (named.length && matching.length !== 1)
      error(
        "Category",
        "Category is archived, ambiguous or incompatible with the transaction type.",
      );
    if (
      result.errors.length !== before ||
      !account ||
      (type !== "expense" && type !== "income")
    )
      continue;
    const category = matching[0];
    if (!category) {
      const known = newCategories.get(categoryKey);
      newCategories.set(categoryKey, {
        key: categoryKey,
        name: known?.name ?? row.category,
        type: known && known.type !== type ? "both" : type,
      });
    }
    const categoryName =
      category?.name ?? newCategories.get(categoryKey)?.name ?? row.category;
    result.rows.push({
      rowNumber: row.rowNumber,
      categoryKey,
      categoryName,
      accountName: account.name,
      input: {
        account_id: account.id,
        category_id: category?.id ?? null,
        type,
        amount_cents: cents,
        description: row.description.trim() ? row.description : categoryName,
        transaction_date: row.date,
        is_balance_adjustment: false,
      },
    });
  }
  result.unknownAccounts = [...missingAccounts];
  result.unknownCategories = [...newCategories.values()];
  result.expenseCents = sumCents(
    result.rows
      .filter((row) => row.input.type === "expense")
      .map((row) => row.input.amount_cents),
  );
  result.incomeCents = sumCents(
    result.rows
      .filter((row) => row.input.type === "income")
      .map((row) => row.input.amount_cents),
  );
  return result;
}
