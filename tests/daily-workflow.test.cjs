const assert = require("node:assert/strict");
const { test } = require("node:test");
const { database } = require("./helpers.cjs");
const { initializeDatabase } = require("../database/database.ts");
const {
  createAccount,
  getAccountBalance,
  archiveAccount,
} = require("../database/repositories/accountRepository.ts");
const {
  getCategories,
  createCategory,
} = require("../database/repositories/categoryRepository.ts");
const {
  getTransactionById,
  updateTransaction,
  softDeleteTransaction,
  getTransactions,
} = require("../database/repositories/transactionRepository.ts");
const {
  getTransactionViews,
  getAccountBalances,
  getRecentDescriptions,
} = require("../database/repositories/financeReadRepository.ts");
const {
  saveEntry,
  adjustAccountBalance,
  getDashboard,
  getLastAccount,
} = require("../services/finance.ts");
const {
  entryFormSchema,
  resetForAnother,
  decimalField,
  signedDecimalToCents,
} = require("../utils/entryForm.ts");
const {
  localCalendarDate,
  calendarDateToPicker,
} = require("../utils/dates.ts");
const { withWriteTransaction } = require("../database/repositories/shared.ts");
async function fixture(task) {
  const instance = database();
  try {
    const db = instance.adapter;
    await initializeDatabase(db);
    const account = await createAccount(db, {
      name: "Cash",
      type: "cash",
      initial_balance_cents: 50000,
    });
    const categories = await getCategories(db);
    const input = (
      name,
      amount,
      type = "expense",
      description = name,
      date = "2026-10-01",
    ) => ({
      account_id: account.id,
      category_id: categories.find((category) => category.name === name).id,
      type,
      amount_cents: amount,
      description,
      transaction_date: date,
    });
    await task({ db, account, input, instance });
  } finally {
    instance.sqlite.close();
  }
}
test("daily scenario including edit, delete and auditable 9 EUR adjustment", async () =>
  fixture(async ({ db, account, input }) => {
    const coffee = await saveEntry(db, input("Coffee", 100));
    assert.equal(await getAccountBalance(db, account.id), 49900);
    await saveEntry(db, input("Lunch", 600));
    assert.equal(await getAccountBalance(db, account.id), 49300);
    const fuel = await saveEntry(db, input("Fuel", 3000));
    assert.equal(await getAccountBalance(db, account.id), 46300);
    await saveEntry(db, input("Client Payment", 5000, "income"));
    assert.equal(await getAccountBalance(db, account.id), 51300);
    await updateTransaction(db, fuel.id, input("Fuel", 3500));
    assert.equal(await getAccountBalance(db, account.id), 50800);
    await softDeleteTransaction(db, coffee.id);
    assert.equal(await getAccountBalance(db, account.id), 50900);
    const adjustment = await adjustAccountBalance(
      db,
      account.id,
      50000,
      "2026-10-01",
    );
    assert.equal(adjustment.amount_cents, 900);
    assert.equal(adjustment.type, "expense");
    assert.equal(adjustment.is_balance_adjustment, 1);
    assert.equal(adjustment.category_id, null);
    assert.equal(await getAccountBalance(db, account.id), 50000);
    assert.equal(
      (await getTransactionById(db, adjustment.id)).description,
      "Balance Adjustment",
    );
    assert.equal(
      (await getDashboard(db, new Date(2026, 9, 1, 12))).month.expenses,
      4100,
    );
    assert.equal(await getLastAccount(db), account.id);
  }));
test("positive correction, zero correction and archived account protection", async () =>
  fixture(async ({ db, account }) => {
    const adjustment = await adjustAccountBalance(
      db,
      account.id,
      50500,
      "2026-09-30",
    );
    assert.equal(adjustment.type, "income");
    assert.equal(adjustment.amount_cents, 500);
    assert.equal(
      await adjustAccountBalance(db, account.id, 50500, "2026-10-01"),
      null,
    );
    assert.equal((await getTransactions(db)).length, 1);
    await archiveAccount(db, account.id);
    await assert.rejects(
      adjustAccountBalance(db, account.id, 50000, "2026-10-01"),
      /active account/,
    );
    assert.equal((await getAccountBalances(db))[0].balance_cents, 50500);
  }));
test("new write connections enable foreign keys and roll back atomic entry preferences", async () =>
  fixture(async ({ db, input }) => {
    await withWriteTransaction(db, async (tx) => {
      assert.equal(
        (await tx.getFirstAsync("PRAGMA foreign_keys")).foreign_keys,
        1,
      );
      assert.equal(
        (await tx.getFirstAsync("PRAGMA busy_timeout")).timeout,
        5000,
      );
      await assert.rejects(
        tx.runAsync(
          "INSERT INTO transactions (id, account_id, category_id, type, amount_cents, description, transaction_date, created_at, updated_at) VALUES ('direct', 'missing', ?, 'expense', 1, 'note', '2026-10-01', 'now', 'now')",
          input("Coffee", 100).category_id,
        ),
        /FOREIGN KEY/,
      );
      throw new Error("Force rollback");
    }).catch((error) => assert.match(error.message, /Force rollback/));
    await db.execAsync(
      "CREATE TRIGGER fail_preferences BEFORE INSERT ON app_metadata BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;",
    );
    await assert.rejects(
      saveEntry(db, input("Coffee", 100)),
      /simulated failure/,
    );
    assert.equal((await getTransactions(db)).length, 0);
    assert.equal(await getLastAccount(db), null);
  }));
test("dashboard uses financial month/day, excludes corrections, and groups yesterday stably", async () =>
  fixture(async ({ db, input }) => {
    await saveEntry(
      db,
      input("Groceries", 280, "expense", "hargj", "2026-09-30"),
    );
    await saveEntry(db, input("Coffee", 100));
    await saveEntry(db, input("Salary", 10000, "income"));
    await adjustAccountBalance(
      db,
      input("Coffee", 100).account_id,
      60000,
      "2026-10-01",
    );
    const dashboard = await getDashboard(db, new Date(2026, 9, 1, 12));
    assert.equal(dashboard.balance, 60000);
    assert.deepEqual(dashboard.month, {
      income: 10000,
      expenses: 100,
      net: 9900,
    });
    assert.deepEqual(dashboard.today, dashboard.month);
    const views = await getTransactionViews(db);
    const yesterday = views.find((record) => record.description === "hargj");
    assert.equal(yesterday.transaction_date, "2026-09-30");
    assert.equal(yesterday.category_name, "Groceries");
    assert.equal(
      localCalendarDate(calendarDateToPicker("2026-09-30")),
      "2026-09-30",
    );
  }));
test("Unicode description search, Albanian name inflection and literal punctuation", async () =>
  fixture(async ({ db, input }) => {
    for (const description of [
      "30 NAFT benzit",
      "darka me elonen",
      "Spotify",
      "QËTHJA",
      "100% quoted '; --",
    ])
      await saveEntry(db, input("Other", 100, "expense", description));
    for (const [search, description] of [
      ["naft", "30 NAFT benzit"],
      ["elona", "darka me elonen"],
      ["spotify", "Spotify"],
      ["qëthja", "QËTHJA"],
      ["'; --", "100% quoted '; --"],
    ]) {
      const found = await getTransactionViews(db, { search });
      assert.equal(found.length, 1);
      assert.equal(found[0].description, description);
    }
    assert.equal(
      (await getTransactionViews(db, { search: "%", limit: 1 })).length,
      1,
    );
    assert.equal(
      (await getTransactionViews(db, { search: "not present" })).length,
      0,
    );
    assert.equal((await getTransactionViews(db, { search: "   " })).length, 5);
  }));
test("Save & Add Another reset keeps date/account/type and schema rejects invalid input", () => {
  const values = {
    type: "expense",
    amount: "2.20",
    description: "Coffee",
    account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    category_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    transaction_date: "2026-09-30",
    is_balance_adjustment: false,
  };
  const next = resetForAnother(values);
  assert.deepEqual(next, {
    ...values,
    amount: "",
    description: "",
    category_id: "",
  });
  assert.ok(entryFormSchema.safeParse(values).success);
  for (const patch of [
    { amount: "" },
    { amount: "0" },
    { amount: "-1" },
    { amount: "2.201" },
    { amount: "90071992547409.92" },
    { description: "" },
    { account_id: "" },
    { category_id: "" },
    { transaction_date: "2026-02-30" },
  ])
    assert.equal(
      entryFormSchema.safeParse({ ...values, ...patch }).success,
      false,
    );
  assert.ok(decimalField(true, true).safeParse("-1.50").success);
  assert.equal(signedDecimalToCents("-1.50"), -150);
});
test("SQLite restart preserves entries, preferences, seeds and custom category", async () =>
  fixture(async ({ db, account, input, instance }) => {
    const custom = await createCategory(db, {
      name: "Engagement",
      type: "expense",
    });
    const entry = await saveEntry(db, {
      ...input("Other", 3800),
      category_id: custom.id,
      description: "Engagement makeup",
    });
    const reopened = instance.restart().adapter;
    await initializeDatabase(reopened);
    assert.equal(
      (await getTransactionById(reopened, entry.id)).description,
      "Engagement makeup",
    );
    assert.equal(await getLastAccount(reopened), account.id);
    assert.equal((await getCategories(reopened)).length, 26);
    assert.equal(await getAccountBalance(reopened, account.id), 46200);
  }));
test("history pagination and recent descriptions never include deleted records", async () =>
  fixture(async ({ db, input }) => {
    const entries = [];
    for (let index = 0; index < 55; index++)
      entries.push(
        await saveEntry(db, input("Coffee", 10, "expense", `Coffee ${index}`)),
      );
    await softDeleteTransaction(db, entries[0].id);
    const first = await getTransactionViews(db, { limit: 50 });
    const next = await getTransactionViews(db, { limit: 50, offset: 50 });
    assert.equal(first.length, 50);
    assert.equal(next.length, 4);
    assert.equal(new Set([...first, ...next].map((row) => row.id)).size, 54);
    assert.equal((await getRecentDescriptions(db, "expense")).length, 4);
    assert.ok(
      !(await getRecentDescriptions(db, "expense")).includes("Coffee 0"),
    );
  }));
