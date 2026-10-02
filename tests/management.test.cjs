const assert = require("node:assert/strict");
const { test } = require("node:test");
const { database } = require("./helpers.cjs");
const { initializeDatabase } = require("../database/database.ts");
const categories = require("../database/repositories/categoryRepository.ts");
const accounts = require("../database/repositories/accountRepository.ts");
const transactions = require("../database/repositories/transactionRepository.ts");
const {
  getCategoryExpenseBreakdown,
} = require("../database/repositories/statisticsRepository.ts");
const { saveTheme, loadPreferences } = require("../services/preferences.ts");
const { useSettingsStore } = require("../store/settingsStore.ts");
test("category edits and archive/restore preserve IDs, amounts and pending sync; Other stays available", async () => {
  const fixture = database();
  const db = fixture.adapter;
  try {
    await initializeDatabase(db);
    const account = await accounts.createAccount(db, {
      name: "Cash",
      type: "cash",
      initial_balance_cents: 10000,
    });
    const category = await categories.createCategory(db, {
      name: "Engagement",
      type: "both",
    });
    const transaction = await transactions.createTransaction(db, {
      account_id: account.id,
      category_id: category.id,
      type: "expense",
      amount_cents: 1234,
      description: "Engagement",
      transaction_date: "2026-10-02",
    });
    await categories.updateCategory(db, category.id, {
      name: "Travel",
      type: "both",
    });
    await categories.archiveCategory(db, category.id);
    assert.equal(
      (await categories.getExpenseCategories(db)).some(
        (row) => row.id === category.id,
      ),
      false,
    );
    assert.equal(
      (await transactions.getTransactionById(db, transaction.id)).category_id,
      category.id,
    );
    const breakdown = await getCategoryExpenseBreakdown(db, {
      fromDate: "2026-10-02",
      toDate: "2026-10-02",
    });
    assert.equal(breakdown[0].name, "Travel");
    assert.equal(breakdown[0].cents, 1234);
    await categories.restoreCategory(db, category.id);
    assert.equal(
      (await categories.getCategoryById(db, category.id)).sync_status,
      "pending",
    );
    await assert.rejects(
      () =>
        categories.archiveCategory(db, "00000000-0000-4000-8000-000000000018"),
      /remain available/,
    );
    await accounts.archiveAccount(db, account.id);
    assert.equal(await accounts.getAccountBalance(db, account.id), 8766);
    assert.equal((await accounts.getAccounts(db)).length, 0);
    await accounts.restoreAccount(db, account.id);
    assert.equal((await accounts.getAccounts(db)).length, 1);
    assert.equal(
      (await accounts.getAccountById(db, account.id)).sync_status,
      "pending",
    );
  } finally {
    fixture.sqlite.close();
  }
});
test("theme preference survives SQLite restart without using SecureStore", async () => {
  const fixture = database();
  try {
    await initializeDatabase(fixture.adapter);
    await saveTheme(fixture.adapter, "dark");
    useSettingsStore.getState().setTheme("system");
    fixture.restart();
    await loadPreferences(fixture.adapter);
    assert.equal(useSettingsStore.getState().theme, "dark");
  } finally {
    fixture.sqlite.close();
  }
});
