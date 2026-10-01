const assert = require('node:assert/strict');
const { test } = require('node:test');
const { database } = require('./helpers.cjs');
const { initializeDatabase } = require('../database/database.ts');
const accounts = require('../database/repositories/accountRepository.ts');
const categories = require('../database/repositories/categoryRepository.ts');
const transactions = require('../database/repositories/transactionRepository.ts');
const money = require('../utils/currency.ts');
const { defaultExpenseCategories, defaultIncomeCategories } = require('../constants/categories.ts');
const { defaultCategoriesMigration } = require('../database/migrations/003_default_categories.ts');
async function fixture(callback) {
  const { sqlite, adapter: db } = database();
  try {
    await initializeDatabase(db);
    const account = await accounts.createAccount(db, { name: 'Cash', type: 'cash', initial_balance_cents: 50000 });
    const category = (await categories.getExpenseCategories(db)).find((row) => row.name === 'Groceries');
    const income = (await categories.getIncomeCategories(db)).find((row) => row.name === 'Salary');
    const input = { account_id: account.id, category_id: category.id, type: 'expense', amount_cents: 3000, description: '30 naft benzit', transaction_date: '2026-10-01' };
    await callback({ db, account, category, income, input });
  } finally { sqlite.close(); }
}
test('integer decimal conversion and exact EUR display', () => {
  for (const [decimal, cents] of [['0.10', 10], ['0.20', 20], ['1.99', 199], ['51.60', 5160], ['999.99', 99999], ['1200', 120000]]) {
    assert.equal(money.decimalToCents(decimal), cents);
    assert.equal(money.decimalToCents(money.centsToDecimal(cents)), cents);
    assert.equal(money.formatAmount(cents), new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100));
  }
  assert.equal(money.sumCents([money.decimalToCents('0.10'), money.decimalToCents('0.20')]), 30);
  assert.equal(money.decimalToCents(' 51,60 '), 5160);
  assert.equal(money.centsToDecimal(-1), '-0.01');
  assert.equal(money.formatAmount(Number.MAX_SAFE_INTEGER), '€90,071,992,547,409.91');
  assert.equal(money.sumCents([Number.MAX_SAFE_INTEGER, 1, -1]), Number.MAX_SAFE_INTEGER);
  for (const value of ['-1', '+1', '1.001', '1,200.00', '1e2', 'NaN', '', '.10', '1.', '1 000', '90071992547409.92']) assert.throws(() => money.decimalToCents(value));
  assert.throws(() => money.sumCents([Number.MAX_SAFE_INTEGER, 1]));
  assert.throws(() => money.validateCents(1.5));
});
test('balance lifecycle matches 500 → 470 → 570 → 565 → 600', async () => fixture(async ({ db, account, income, input }) => {
  assert.equal(await accounts.getAccountBalance(db, account.id), 50000);
  const expense = await transactions.createTransaction(db, input);
  assert.equal(await accounts.getAccountBalance(db, account.id), 47000);
  await transactions.createTransaction(db, { ...input, category_id: income.id, type: 'income', amount_cents: 10000, description: 'Client income' });
  assert.equal(await accounts.getAccountBalance(db, account.id), 57000);
  await transactions.updateTransaction(db, expense.id, { ...input, amount_cents: 3500 });
  assert.equal(await accounts.getAccountBalance(db, account.id), 56500);
  await transactions.softDeleteTransaction(db, expense.id);
  assert.equal(await accounts.getAccountBalance(db, account.id), 60000);
  assert.equal(await transactions.getTotalIncome(db), 10000);
  assert.equal(await transactions.getTotalExpenses(db), 0);
  assert.equal(await transactions.getTransactionById(db, expense.id), null);
  const tombstone = await transactions.getTransactionById(db, expense.id, true);
  assert.ok(tombstone.deleted_at);
  assert.equal(tombstone.sync_status, 'pending');
  await transactions.softDeleteTransaction(db, expense.id);
  await assert.rejects(transactions.updateTransaction(db, expense.id, input), /not found/);
  assert.equal((await transactions.getTransactions(db)).length, 1);
  assert.equal((await transactions.getTransactions(db, { includeDeleted: true })).length, 2);
}));
test('version 1 upgrade preserves metadata and default seeds are idempotent', async () => {
  const { sqlite, adapter: db } = database();
  try {
    await db.execAsync("CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); INSERT INTO app_metadata VALUES ('existing','retained'); CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,'foundation_metadata','old');");
    await initializeDatabase(db);
    await initializeDatabase(db);
    await defaultCategoriesMigration.up(db);
    assert.equal((await db.getFirstAsync('SELECT value FROM app_metadata')).value, 'retained');
    const seeded = await categories.getCategories(db);
    assert.equal(seeded.length, 25);
    assert.deepEqual(seeded.filter((row) => row.type === 'expense').map((row) => row.name).sort(), [...defaultExpenseCategories].sort());
    assert.deepEqual(seeded.filter((row) => row.type === 'income').map((row) => row.name).sort(), [...defaultIncomeCategories].sort());
    assert.ok(seeded.every((row) => row.is_default === 1 && row.sync_status === 'pending'));
    const groceries = seeded.find((row) => row.name === 'Groceries');
    await categories.updateCategory(db, groceries.id, { name: 'Groceries', type: 'expense', icon: 'cart-outline' });
    await categories.archiveCategory(db, groceries.id);
    await initializeDatabase(db);
    assert.equal((await categories.getCategoryById(db, groceries.id)).is_archived, 1);
    assert.equal((await categories.getCategories(db, { includeArchived: true })).length, 25);
  } finally { sqlite.close(); }
});
test('custom both categories, archive retention, and historical edits', async () => fixture(async ({ db, account, input }) => {
  const custom = await categories.createCategory(db, { name: "Travel'; --", type: 'both' });
  assert.equal(custom.is_default, 0);
  assert.ok((await categories.getIncomeCategories(db)).some((row) => row.id === custom.id));
  assert.ok((await categories.getExpenseCategories(db)).some((row) => row.id === custom.id));
  const record = await transactions.createTransaction(db, { ...input, category_id: custom.id });
  await categories.archiveCategory(db, custom.id);
  await accounts.archiveAccount(db, account.id);
  assert.equal((await categories.getCategories(db)).some((row) => row.id === custom.id), false);
  assert.equal((await accounts.getAccounts(db)).length, 0);
  assert.equal((await accounts.getAccounts(db, true)).length, 1);
  assert.equal(await accounts.getCombinedBalance(db), 47000);
  assert.equal((await transactions.getTransactionById(db, record.id)).category_id, custom.id);
  await transactions.updateTransaction(db, record.id, { ...input, category_id: custom.id, amount_cents: 3500 });
  await assert.rejects(transactions.createTransaction(db, { ...input, category_id: custom.id }), /active account/);
  await assert.rejects(categories.updateCategory(db, custom.id, { name: 'Travel', type: 'income' }), /conflicts/);
  await assert.rejects(db.runAsync('DELETE FROM categories WHERE id = ?', custom.id), /FOREIGN KEY/);
  await assert.rejects(db.runAsync('DELETE FROM accounts WHERE id = ?', account.id), /FOREIGN KEY/);
}));
test('adjustments affect balances but not income/expense totals', async () => fixture(async ({ db, account, input }) => {
  await transactions.createTransaction(db, { ...input, category_id: null, is_balance_adjustment: true, type: 'income', amount_cents: 1000 });
  await transactions.createTransaction(db, { ...input, category_id: null, is_balance_adjustment: true, type: 'expense', amount_cents: 500 });
  assert.equal(await accounts.getAccountBalance(db, account.id), 50500);
  assert.equal(await transactions.getTotalIncome(db), 0);
  assert.equal(await transactions.getTotalExpenses(db), 0);
  assert.equal((await transactions.getTransactions(db, { includeAdjustments: false })).length, 0);
}));
test('reject invalid amounts, dates, descriptions, references and category types', async () => fixture(async ({ db, income, category, input }) => {
  for (const patch of [{ amount_cents: 0 }, { amount_cents: -1 }, { amount_cents: 1.5 }, { amount_cents: Number.MAX_SAFE_INTEGER + 1 }, { transaction_date: '2026-02-30' }, { description: '   ' }, { account_id: 'invalid' }, { category_id: null }, { category_id: income.id }, { account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { is_balance_adjustment: true }]) {
    await assert.rejects(transactions.createTransaction(db, { ...input, ...patch }));
  }
  await categories.archiveCategory(db, category.id);
  await assert.rejects(transactions.createTransaction(db, input), /active category/);
  assert.equal((await transactions.getTransactions(db)).length, 0);
}));
test('date/category/account filtering, unpaginated totals, and transfers via edits', async () => fixture(async ({ db, account, category, input }) => {
  const other = await accounts.createAccount(db, { name: 'Bank', type: 'bank', initial_balance_cents: 120000 });
  const first = await transactions.createTransaction(db, { ...input, amount_cents: 10, transaction_date: '2026-09-30' });
  await transactions.createTransaction(db, { ...input, amount_cents: 20 });
  await transactions.createTransaction(db, { ...input, account_id: other.id, amount_cents: 199, transaction_date: '2026-10-02' });
  assert.equal((await transactions.getTransactionsByDateRange(db, '2026-10-01', '2026-10-01')).length, 1);
  assert.equal((await transactions.getTransactionsByCategory(db, category.id)).length, 3);
  assert.equal((await transactions.getTransactions(db, { accountId: account.id })).length, 2);
  assert.equal((await transactions.getTransactions(db, { limit: 1, offset: 1 })).length, 1);
  assert.equal(await transactions.getTotalExpenses(db), 229);
  assert.equal(await transactions.getTotalExpenses(db, { fromDate: '2026-10-01', toDate: '2026-10-01' }), 20);
  await transactions.updateTransaction(db, first.id, { ...input, account_id: other.id, amount_cents: 10 });
  assert.equal(await accounts.getAccountBalance(db, account.id), 49980);
  assert.equal(await accounts.getAccountBalance(db, other.id), 119791);
  assert.equal(await accounts.getCombinedBalance(db), 169771);
  await assert.rejects(transactions.getTransactions(db, { fromDate: '2026-10-02', toDate: '2026-10-01' }));
  await assert.rejects(transactions.getTransactions(db, { limit: 0 }));
  await assert.rejects(transactions.getTransactions(db, { fromDate: '' }));
}));
test('migration failure preserves the shipped version 1 database', async () => {
  const { sqlite, adapter: db } = database();
  try {
    await db.execAsync("CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); INSERT INTO app_metadata VALUES ('existing','retained'); CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,'foundation_metadata','old'); CREATE TABLE transactions (id TEXT);");
    await assert.rejects(initializeDatabase(db), /Local database/);
    assert.equal((await db.getFirstAsync('SELECT value FROM app_metadata')).value, 'retained');
    assert.equal((await db.getAllAsync('SELECT version FROM schema_migrations')).length, 1);
    assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'accounts'"), null);
  } finally { sqlite.close(); }
});
test('updated records become pending and derived balances reject overflow', async () => fixture(async ({ db, account, category, input }) => {
  const transaction = await transactions.createTransaction(db, input);
  await db.runAsync("UPDATE transactions SET sync_status = 'synced' WHERE id = ?", transaction.id);
  const updated = await transactions.updateTransaction(db, transaction.id, { ...input, description: '6 dreka me elonen' });
  assert.equal(updated.sync_status, 'pending');
  assert.equal(updated.created_at, transaction.created_at);
  assert.equal(updated.transaction_date, '2026-10-01');
  await db.runAsync("UPDATE accounts SET sync_status = 'synced' WHERE id = ?", account.id);
  assert.equal((await accounts.updateAccount(db, account.id, { name: 'Cash wallet', type: 'cash', initial_balance_cents: 50000 })).sync_status, 'pending');
  await db.runAsync("UPDATE categories SET sync_status = 'synced' WHERE id = ?", category.id);
  assert.equal((await categories.updateCategory(db, category.id, { name: 'Groceries', type: 'both' })).sync_status, 'pending');
  const large = await accounts.createAccount(db, { name: 'Large', type: 'other', initial_balance_cents: Number.MAX_SAFE_INTEGER });
  await transactions.createTransaction(db, { ...input, account_id: large.id, category_id: category.id, type: 'income', amount_cents: 1 });
  await assert.rejects(accounts.getAccountBalance(db, large.id), /safe integer/);
  await assert.rejects(accounts.getCombinedBalance(db), /safe integer/);
}));
test('SQLite constraints reject fractional amounts and missing foreign keys', async () => fixture(async ({ db, input }) => {
  const sql = 'INSERT INTO transactions (id, account_id, category_id, type, amount_cents, description, transaction_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  await assert.rejects(db.runAsync(sql, 'direct', input.account_id, input.category_id, 'expense', 1.5, 'note', '2026-10-01', 'now', 'now'), /CHECK/);
  await assert.rejects(db.runAsync(sql, 'direct', 'missing', input.category_id, 'expense', 1, 'note', '2026-10-01', 'now', 'now'), /FOREIGN KEY/);
  assert.equal((await transactions.getTransactions(db)).length, 0);
}));
