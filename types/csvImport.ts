import type { TransactionInput } from "../utils/financeValidation";
import type { CategoryType } from "./finance";
export interface CsvImportRow {
  rowNumber: number;
  date: string;
  type: string;
  amount: string;
  description: string;
  category: string;
  account: string;
}
export interface CsvValidationError {
  rowNumber: number;
  field: string;
  problem: string;
}
export type CsvAccountMapping = Record<string, string>;
export interface CsvImportCandidate {
  rowNumber: number;
  categoryKey: string;
  categoryName: string;
  accountName: string;
  input: TransactionInput;
}
export interface CsvImportBatch {
  id: string;
  file_name: string;
  content_hash: string;
  imported_at: string;
  row_count: number;
  skipped_count: number;
}
export interface CsvImportPreview {
  rows: CsvImportCandidate[];
  errors: CsvValidationError[];
  unknownAccounts: string[];
  unknownCategories: { key: string; name: string; type: CategoryType }[];
  expenseCents: number;
  incomeCents: number;
}
