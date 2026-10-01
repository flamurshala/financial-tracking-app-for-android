import type { SQLiteDatabase } from "expo-sqlite";
import { endOfMonth, startOfMonth } from "date-fns";
import {
  getAccountById,
  getAccountBalance,
} from "../database/repositories/accountRepository";
import {
  getAccountBalances,
  getTransactionViews,
} from "../database/repositories/financeReadRepository";
import {
  createTransactionInTransaction,
  getTotalExpenses,
  getTotalIncome,
} from "../database/repositories/transactionRepository";
import {
  getMetadata,
  setMetadata,
} from "../database/repositories/metadataRepository";
import { withWriteTransaction } from "../database/repositories/shared";
import {
  centsSchema,
  idSchema,
  type TransactionInput,
} from "../utils/financeValidation";
import { calendarDateSchema, localCalendarDate } from "../utils/dates";
import { sumCents } from "../utils/currency";
const lastAccountKey = "entry.last_account_id";
export function getLastAccount(db: SQLiteDatabase) {
  return getMetadata(db, lastAccountKey);
}
export async function saveEntry(db: SQLiteDatabase, input: TransactionInput) {
  return withWriteTransaction(db, async (tx) => {
    const record = await createTransactionInTransaction(tx, input);
    await setMetadata(tx, lastAccountKey, record.account_id);
    return record;
  });
}
/** Re-read balance and create the correction in the same exclusive transaction. */
export async function adjustAccountBalance(
  db: SQLiteDatabase,
  accountId: string,
  actualCents: number,
  date: string,
) {
  idSchema.parse(accountId);
  centsSchema.parse(actualCents);
  calendarDateSchema.parse(date);
  return withWriteTransaction(db, async (tx) => {
    const account = await getAccountById(tx, accountId);
    if (!account || account.is_archived)
      throw new Error("Choose an active account");
    const currentCents = await getAccountBalance(tx, accountId);
    const difference = sumCents([actualCents, -currentCents]);
    if (difference === 0) return null;
    return createTransactionInTransaction(tx, {
      account_id: accountId,
      category_id: null,
      type: difference > 0 ? "income" : "expense",
      amount_cents: Math.abs(difference),
      description: "Balance Adjustment",
      transaction_date: date,
      is_balance_adjustment: true,
    });
  });
}
export async function getDashboard(db: SQLiteDatabase, now = new Date()) {
  const today = localCalendarDate(now);
  const month = {
    fromDate: localCalendarDate(startOfMonth(now)),
    toDate: localCalendarDate(endOfMonth(now)),
  };
  // Short exclusive snapshot; prevents totals and balances spanning a concurrent write.
  return withWriteTransaction(db, async (tx) => {
    const accounts = await getAccountBalances(tx);
    const monthIncome = await getTotalIncome(tx, month);
    const monthExpenses = await getTotalExpenses(tx, month);
    const todayIncome = await getTotalIncome(tx, {
      fromDate: today,
      toDate: today,
    });
    const todayExpenses = await getTotalExpenses(tx, {
      fromDate: today,
      toDate: today,
    });
    const recent = await getTransactionViews(tx, { limit: 5 });
    return {
      accounts,
      balance: sumCents(accounts.map((account) => account.balance_cents)),
      month: {
        income: monthIncome,
        expenses: monthExpenses,
        net: sumCents([monthIncome, -monthExpenses]),
      },
      today: {
        income: todayIncome,
        expenses: todayExpenses,
        net: sumCents([todayIncome, -todayExpenses]),
      },
      recent,
    };
  });
}
