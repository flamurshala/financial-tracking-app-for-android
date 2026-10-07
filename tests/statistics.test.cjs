const assert = require("node:assert/strict");
const { test } = require("node:test");
const { database } = require("./helpers.cjs");
const { initializeDatabase } = require("../database/database.ts");
const accounts = require("../database/repositories/accountRepository.ts");
const categories = require("../database/repositories/categoryRepository.ts");
const transactions = require("../database/repositories/transactionRepository.ts");
const reports = require("../database/repositories/statisticsRepository.ts");
const {
  getTransactionViews,
} = require("../database/repositories/financeReadRepository.ts");
const {
  getStatisticsReport,
  getPreviousMonthComparison,
} = require("../services/statistics.ts");
const periods = require("../utils/periods.ts");
const october = { fromDate: "2026-10-01", toDate: "2026-10-31" };
async function fixture(run) {
  const databaseFixture = database();
  const db = databaseFixture.adapter;
  try {
    await initializeDatabase(db);
    const cash = await accounts.createAccount(db, {
      name: "Cash",
      type: "cash",
      initial_balance_cents: 0,
    });
    const card = await accounts.createAccount(db, {
      name: "Card",
      type: "bank",
      initial_balance_cents: 0,
    });
    const all = await categories.getCategories(db);
    const category = (name) => all.find((row) => row.name === name);
    const records = [];
    for (const [day, name, amount, description, type] of [
      [1, "Coffee", 100, "Coffee"],
      [1, "Groceries", 800, "Groceries"],
      [2, "Fuel", 3000, "naft"],
      [2, "Lunch", 600, "Lunch"],
      [3, "Coffee", 200, "Coffee"],
      [3, "Client Payment", 5000, "Client Payment", "income"],
      [4, "Dinner", 2200, "Darkë me Elonën"],
      [4, "Parking", 200, "Parking"],
    ]) {
      const chosen =
        category(name) ?? all.find((row) => row.type === (type ?? "expense"));
      records.push(
        await transactions.createTransaction(db, {
          account_id: cash.id,
          category_id: chosen.id,
          type: type ?? "expense",
          amount_cents: amount,
          description,
          transaction_date: `2026-10-0${day}`,
        }),
      );
    }
    await run({ db, cash, card, category, records });
  } finally {
    databaseFixture.sqlite.close();
  }
}
test("known October data: exact daily, weekly, monthly and yearly reports", async () =>
  fixture(async ({ db }) => {
    const day = await getStatisticsReport(
      db,
      "day",
      "2026-10-01",
      periods.getPeriodRange("day", "2026-10-01"),
    );
    assert.deepEqual(day.summary, {
      income: 0,
      expenses: 900,
      net: -900,
      incomeCount: 0,
      expenseCount: 2,
      transactionCount: 2,
    });
    assert.equal(day.largestExpense.amount_cents, 800);
    const week = await getStatisticsReport(
      db,
      "week",
      "2026-10-01",
      periods.getPeriodRange("week", "2026-10-01"),
    );
    assert.equal(week.summary.expenses, 7100);
    assert.equal(week.summary.income, 5000);
    assert.equal(week.summary.net, -2100);
    assert.equal(week.averageDailyCents, 1014);
    assert.equal(week.daily.length, 7);
    assert.equal(week.highestDay.date, "2026-10-02");
    assert.equal(week.lowestDay.expenses, 0);
    assert.equal(week.mostUsed.name, "Coffee");
    assert.equal(week.largestExpense.amount_cents, 3000);
    const month = await getStatisticsReport(db, "month", "2026-10-01", october);
    assert.equal(month.averageDailyCents, 229);
    assert.equal(month.days, 31);
    assert.equal(month.summary.transactionCount, 8);
    assert.equal(month.comparison.percentageChange, null);
    const totals = Object.fromEntries(
      month.expenses.map((row) => [row.name, row.cents]),
    );
    assert.equal(totals.Coffee, 300);
    assert.equal(totals.Fuel, 3000);
    assert.equal(totals.Dinner, 2200);
    assert.equal(month.income[0].percentage, 100);
    assert.ok(
      Math.abs(
        month.expenses.reduce((sum, row) => sum + row.percentage, 0) - 100,
      ) < 1e-10,
    );
    const year = await getStatisticsReport(
      db,
      "year",
      "2026-10-01",
      periods.getPeriodRange("year", "2026-10-01"),
    );
    assert.equal(year.averageMonthlyCents, 592);
    assert.equal(year.monthly.length, 12);
    assert.equal(year.monthly[9].expenses, 7100);
    assert.equal(year.monthly[0].expenses, 0);
    assert.equal(year.highestMonth.month, "2026-10");
  }));
test("all filters combine in SQL, inclusive amount/date bounds, search literals and pagination", async () =>
  fixture(async ({ db, cash, card, category }) => {
    const filters = {
      ...october,
      type: "expense",
      accountId: cash.id,
      categoryId: category("Dinner").id,
      minAmountCents: 2200,
      maxAmountCents: 2200,
      search: "elona",
    };
    const rows = await getTransactionViews(db, filters);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].description, "Darkë me Elonën");
    assert.equal(
      (await getTransactionViews(db, { ...filters, accountId: card.id }))
        .length,
      0,
    );
    assert.equal(
      (await getTransactionViews(db, { ...filters, search: "' OR 1=1 --" }))
        .length,
      0,
    );
    assert.equal(
      (await getTransactionViews(db, { ...october, type: "income" })).length,
      1,
    );
    assert.equal(
      (
        await getTransactionViews(db, {
          ...october,
          minAmountCents: 600,
          maxAmountCents: 800,
        })
      ).length,
      2,
    );
    assert.equal(
      (
        await getTransactionViews(db, {
          fromDate: "2026-10-02",
          toDate: "2026-10-03",
        })
      ).length,
      4,
    );
    const full = await getTransactionViews(db, october);
    const paged = [
      ...(await getTransactionViews(db, { ...october, limit: 3 })),
      ...(await getTransactionViews(db, { ...october, limit: 5, offset: 3 })),
    ];
    assert.deepEqual(
      paged.map((row) => row.id),
      full.map((row) => row.id),
    );
    await assert.rejects(() =>
      getTransactionViews(db, { minAmountCents: 2, maxAmountCents: 1 }),
    );
    await assert.rejects(() =>
      getTransactionViews(db, { minAmountCents: 0.5 }),
    );
    const special = await transactions.createTransaction(db, {
      account_id: cash.id,
      category_id: category("Dinner").id,
      type: "expense",
      amount_cents: 100,
      description: "100% _discount_ \\ café",
      transaction_date: "2026-10-04",
    });
    assert.equal(
      (await getTransactionViews(db, { search: "% _discount_ \\" }))[0].id,
      special.id,
    );
  }));
test("edits and deletes refresh totals, category details and normalized Unicode search", async () =>
  fixture(async ({ db, records, category, cash }) => {
    const coffee = await reports.getTransactionsForCategory(
      db,
      october,
      category("Coffee").id,
      "expense",
    );
    assert.equal(coffee.length, 2);
    const input = {
      account_id: cash.id,
      category_id: category("Coffee").id,
      type: "expense",
      amount_cents: 500,
      description: "Ëmbëlsirë e re",
      transaction_date: "2026-10-01",
    };
    await transactions.updateTransaction(db, records[0].id, input);
    assert.equal((await reports.getPeriodSummary(db, october)).expenses, 7500);
    assert.equal(
      (await getTransactionViews(db, { ...october, search: "ËMBËLSIRË" }))
        .length,
      1,
    );
    await transactions.softDeleteTransaction(db, records[0].id);
    assert.equal((await reports.getPeriodSummary(db, october)).expenses, 7000);
    assert.equal(
      (await getTransactionViews(db, { search: "ËMBËLSIRË" })).length,
      0,
    );
    assert.equal(
      (
        await reports.getTransactionsForCategory(
          db,
          october,
          category("Coffee").id,
          "expense",
        )
      ).length,
      1,
    );
  }));
test("adjustments remain in history and balances but never in reports", async () =>
  fixture(async ({ db, cash }) => {
    const before = await accounts.getAccountBalance(db, cash.id);
    await transactions.createTransaction(db, {
      account_id: cash.id,
      category_id: null,
      type: "expense",
      amount_cents: 900,
      is_balance_adjustment: true,
      description: "Balance correction",
      transaction_date: "2026-10-04",
    });
    assert.equal(await accounts.getAccountBalance(db, cash.id), before - 900);
    assert.equal((await getTransactionViews(db, october)).length, 9);
    assert.equal((await reports.getPeriodSummary(db, october)).expenses, 7100);
    assert.equal(
      (await reports.getCategoryExpenseBreakdown(db, october)).some(
        (row) => row.categoryId === null,
      ),
      false,
    );
  }));
test("empty periods, income-only periods and previous month comparison edge cases", async () =>
  fixture(async ({ db, cash, category }) => {
    const empty = await getStatisticsReport(
      db,
      "month",
      "2026-08-01",
      periods.getPeriodRange("month", "2026-08-01"),
    );
    assert.equal(empty.summary.transactionCount, 0);
    assert.equal(empty.averageDailyCents, 0);
    assert.equal(empty.largestExpense, null);
    assert.deepEqual(empty.expenses, []);
    assert.equal(empty.comparison.percentageChange, null);
    const income = await reports.getPeriodSummary(
      db,
      { fromDate: "2026-10-03", toDate: "2026-10-03" },
      { type: "income" },
    );
    assert.equal(income.expenses, 0);
    assert.equal(income.income, 5000);
    await transactions.createTransaction(db, {
      account_id: cash.id,
      category_id: category("Fuel").id,
      type: "expense",
      amount_cents: 10000,
      description: "September",
      transaction_date: "2026-09-30",
    });
    const lower = await getPreviousMonthComparison(db, "2026-10-01", 7100);
    assert.equal(lower.difference, -2900);
    assert.ok(Math.abs(lower.percentageChange + 29) < 1e-10);
    assert.equal(
      (await getPreviousMonthComparison(db, "2026-10-01", 10000))
        .percentageChange,
      0,
    );
    assert.equal(
      (await getPreviousMonthComparison(db, "2026-10-01", 15000))
        .percentageChange,
      50,
    );
  }));
test("Monday weeks, leap years, month/year boundaries, inclusive and invalid custom dates", () => {
  assert.deepEqual(periods.getPeriodRange("week", "2026-10-01"), {
    fromDate: "2026-09-28",
    toDate: "2026-10-04",
  });
  assert.deepEqual(periods.getPeriodRange("week", "2027-01-01"), {
    fromDate: "2026-12-28",
    toDate: "2027-01-03",
  });
  assert.equal(
    periods.calendarDayCount(periods.getPeriodRange("month", "2024-02-29")),
    29,
  );
  assert.equal(
    periods.calendarDayCount(periods.getPeriodRange("year", "2024-02-29")),
    366,
  );
  assert.equal(periods.movePeriod("month", "2026-12-31", 1), "2027-01-01");
  assert.equal(periods.movePeriod("day", "2026-12-31", 1), "2027-01-01");
  assert.equal(periods.movePeriod("month", "2026-01-31", 1), "2026-02-01");
  assert.equal(
    periods.calendarDayCount({ fromDate: "2026-10-01", toDate: "2026-10-01" }),
    1,
  );
  assert.throws(() =>
    periods.validateRange({ fromDate: "2026-10-02", toDate: "2026-10-01" }),
  );
  assert.throws(() =>
    periods.validateRange({ fromDate: "2026-02-29", toDate: "2026-03-01" }),
  );
});
test("large totals preserve exact cents and unsafe totals reject instead of rounding", async () =>
  fixture(async ({ db, card, category }) => {
    const max = Number.MAX_SAFE_INTEGER;
    assert.equal(reports.roundedAverageCents(max, 1), max);
    assert.equal(reports.roundedAverageCents(1, 2), 1);
    const input = {
      account_id: card.id,
      category_id: category("Fuel").id,
      type: "expense",
      amount_cents: max,
      description: "Large amount",
      transaction_date: "2027-01-01",
    };
    await transactions.createTransaction(db, input);
    const january = { fromDate: "2027-01-01", toDate: "2027-01-31" };
    assert.equal((await reports.getPeriodSummary(db, january)).expenses, max);
    await transactions.createTransaction(db, { ...input, amount_cents: 1 });
    await assert.rejects(() => reports.getPeriodSummary(db, january));
    await assert.rejects(() =>
      reports.getCategoryExpenseBreakdown(db, january),
    );
  }));
test("report type/date query uses the new partial compound index", async () =>
  fixture(async ({ db }) => {
    const plan = await db.getAllAsync(
      "EXPLAIN QUERY PLAN SELECT SUM(t.amount_cents) FROM transactions t WHERE t.deleted_at IS NULL AND t.is_balance_adjustment = 0 AND t.type = ? AND t.transaction_date >= ? AND t.transaction_date <= ?",
      "expense",
      october.fromDate,
      october.toDate,
    );
    assert.ok(
      plan.some((row) => row.detail.includes("transactions_type_date_report")),
    );
  }));

test("version 3 upgrade backfills Unicode search without changing financial metadata", async () => {
  const result = database();
  const db = result.adapter;
  try {
    await db.execAsync(
      "PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    const { migrations } = require("../database/migrations/index.ts");
    for (const migration of migrations.slice(0, 3)) {
      await migration.up(db);
      await db.runAsync(
        "INSERT INTO schema_migrations VALUES (?, ?, ?)",
        migration.version,
        migration.name,
        "2026-09-30",
      );
    }
    const account = await accounts.createAccount(db, {
      name: "Legacy",
      type: "cash",
      initial_balance_cents: 1000,
    });
    const category = (await categories.getExpenseCategories(db))[0];
    const id = require("node:crypto").randomUUID();
    await db.runAsync(
      "INSERT INTO transactions (id,account_id,category_id,type,amount_cents,description,transaction_date,created_at,updated_at,sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      account.id,
      category.id,
      "expense",
      123,
      "Darkë me Elonën",
      "2026-10-01",
      "old-created",
      "old-updated",
      "synced",
    );
    await initializeDatabase(db);
    await initializeDatabase(db);
    const row = (await getTransactionViews(db, { search: "elona" }))[0];
    assert.equal(row.id, id);
    assert.equal(row.amount_cents, 123);
    assert.equal(row.updated_at, "old-updated");
    assert.equal(row.created_at, "old-created");
    assert.equal(row.sync_status, "synced");
    assert.equal(
      (await db.getAllAsync("SELECT * FROM schema_migrations")).length,
      6,
    );
  } finally {
    result.sqlite.close();
  }
});
test("SQL ranges include month/year/leap boundaries and exclude their neighbors", async () =>
  fixture(async ({ db, card, category }) => {
    for (const date of [
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2026-12-31",
      "2027-01-01",
    ])
      await transactions.createTransaction(db, {
        account_id: card.id,
        category_id: category("Coffee").id,
        type: "expense",
        amount_cents: 101,
        description: "Boundary",
        transaction_date: date,
      });
    assert.equal(
      (
        await reports.getPeriodSummary(
          db,
          periods.getPeriodRange("month", "2024-02-29"),
        )
      ).expenses,
      202,
    );
    assert.equal(
      (
        await reports.getPeriodSummary(db, {
          fromDate: "2024-02-29",
          toDate: "2024-02-29",
        })
      ).expenses,
      101,
    );
    assert.equal(
      (
        await reports.getPeriodSummary(
          db,
          periods.getPeriodRange("year", "2026-12-31"),
          { accountId: card.id },
        )
      ).expenses,
      101,
    );
    assert.equal(
      (
        await reports.getPeriodSummary(
          db,
          periods.getPeriodRange("month", "2027-01-01"),
        )
      ).expenses,
      101,
    );
    assert.equal(
      (await reports.getMonthlyTotalsForYear(db, 2024))[1].expenses,
      202,
    );
  }));
