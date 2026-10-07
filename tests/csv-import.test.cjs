const assert = require("node:assert/strict");
const { test } = require("node:test");
const { database } = require("./helpers.cjs");
const { initializeDatabase } = require("../database/database.ts");
const {
  createAccount,
  getAccountBalance,
} = require("../database/repositories/accountRepository.ts");
const {
  createTransaction,
  updateTransaction,
} = require("../database/repositories/transactionRepository.ts");
const {
  previewImport,
  commitImport,
  previousImport,
} = require("../database/repositories/importRepository.ts");
const {
  parseImportCsv,
  importTemplate,
  csvNameKey,
} = require("../utils/csvImport.ts");
const { getDashboard } = require("../services/finance.ts");
const { createHash } = require("node:crypto");
const hash = (text) =>
  createHash("sha256")
    .update(text.replace(/^\uFEFF/, ""))
    .digest("hex");
async function fixture(task) {
  const file = database();
  try {
    await initializeDatabase(file.adapter);
    const account = await createAccount(file.adapter, {
      name: "Cash",
      type: "cash",
      initial_balance_cents: 50000,
    });
    await task(file.adapter, account, file);
  } finally {
    file.sqlite.close();
  }
}
const header = "Date,Type,Amount,Description,Category,Account\r\n";
test("blank and whitespace descriptions fall back on create/edit; custom text is preserved", () =>
  fixture(async (db, account) => {
    const coffee = await db.getFirstAsync(
      "SELECT id FROM categories WHERE name='Coffee'",
    );
    const dinner = await db.getFirstAsync(
      "SELECT id FROM categories WHERE name='Dinner'",
    );
    const base = {
      account_id: account.id,
      category_id: coffee.id,
      type: "expense",
      amount_cents: 100,
      transaction_date: "2026-10-07",
    };
    const first = await createTransaction(db, { ...base, description: "" });
    assert.equal(first.description, "Coffee");
    assert.equal(
      (await createTransaction(db, { ...base, description: " \t\n " }))
        .description,
      "Coffee",
    );
    const custom = "  Dinner with Elona, Çaj  ";
    assert.equal(
      (await createTransaction(db, { ...base, description: custom }))
        .description,
      custom,
    );
    const changed = await updateTransaction(db, first.id, {
      ...base,
      category_id: dinner.id,
      description: "",
    });
    assert.equal(changed.description, "Dinner");
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT description_search FROM transactions WHERE id=?",
          first.id,
        )
      ).description_search,
      "dinner",
    );
    assert.equal(
      (await createTransaction(db, { ...base })).description,
      "Coffee",
    );
  }));
test("parser supports reordered/case-insensitive headers, commas, escaped quotes, multiline and Unicode", () => {
  const rows = parseImportCsv(
    '\uFEFFaccount,CATEGORY,description,amount,TYPE,date\r\nCash,Dinner,"Dinner with Elona, ""drinks""\nÇaj",12.50,EXPENSE,2026-10-01\r\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'Dinner with Elona, "drinks"\nÇaj');
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(parseImportCsv(importTemplate).length, 4);
  for (const text of [
    "",
    "Date,Date,Amount,Description,Category,Account\nx,x,1,,Coffee,Cash",
    "Date,Type,Amount\n2026-10-01,Expense,1",
    header + '2026-10-01,Expense,1,"unterminated,Coffee,Cash',
    header + "2026-10-01,Expense,1,,Coffee,Cash,extra",
    header + "\u0000",
  ])
    assert.throws(() => parseImportCsv(text));
});
test("five-row import previews without writes; exact money/statistics, optional description, pending UUIDs and duplicate warning", () =>
  fixture(async (db, account, file) => {
    const text =
      header +
      '2026-10-01,Expense,1.00,,Coffee,Cash\r\n2026-10-01,Expense,1.00,,Coffee,Cash\r\n2026-10-01,Expense,8.50,Shminka për fejesë,Groceries,Cash\r\n2026-10-01,Expense,12.50,"Dinner with Elona, drinks included",Dinner,Cash\r\n2026-10-01,Income,50.00,Client payment,Client Payment,Cash';
    const raw = parseImportCsv(text),
      preview = await previewImport(db, raw, {});
    assert.equal(preview.rows.length, 5);
    assert.equal(preview.expenseCents, 2300);
    assert.equal(preview.incomeCents, 5000);
    assert.equal(
      (await db.getFirstAsync("SELECT COUNT(*) AS n FROM transactions")).n,
      0,
    );
    const request = {
      raw,
      preview,
      mappings: {},
      fileName: "five.csv",
      hash: hash(text),
      createCategories: false,
      allowDuplicate: false,
    };
    const result = await commitImport(db, request);
    assert.equal(result.batch.row_count, 5);
    assert.equal(await getAccountBalance(db, account.id), 52700);
    const dashboard = await getDashboard(db, new Date(2026, 9, 1, 12));
    assert.equal(dashboard.month.expenses, 2300);
    assert.equal(dashboard.month.income, 5000);
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT COUNT(*) AS n FROM transactions WHERE sync_status='pending' AND description='Coffee'",
        )
      ).n,
      2,
    );
    const ids = await db.getAllAsync("SELECT id FROM transactions");
    assert.equal(new Set(ids.map((row) => row.id)).size, 5);
    assert.ok(ids.every((row) => /^[a-f0-9-]{36}$/.test(row.id)));
    await assert.rejects(() => commitImport(db, request), /already imported/);
    await commitImport(db, { ...request, allowDuplicate: true });
    assert.equal(
      (await db.getFirstAsync("SELECT COUNT(*) AS n FROM transactions")).n,
      10,
    );
    file.restart();
    assert.equal((await previousImport(file.adapter, hash(text))).row_count, 5);
  }));
test("unknown account mapping and explicit category creation derive both type; invalid rows are reported and skipped", () =>
  fixture(async (db, account) => {
    const text =
      header +
      "2026-10-01,Expense,1,,Travel,Wallet\n2026-10-01,Income,2,,travel,Wallet\n2026-02-30,Expense,abc,,Coffee,Cash\n2026-10-01,Expense,0,,Coffee,Cash\n2026-10-01,Expense,-1,,Coffee,Cash\n2026-10-01,Expense,1,,,Cash\n2026-10-01,Expense,1,,Coffee,";
    const raw = parseImportCsv(text);
    let preview = await previewImport(db, raw, {});
    assert.ok(preview.unknownAccounts.includes("Wallet"));
    assert.equal(preview.rows.length, 0);
    const mappings = { [csvNameKey("Wallet")]: account.id };
    preview = await previewImport(db, raw, mappings);
    assert.equal(preview.rows.length, 2);
    assert.equal(preview.unknownCategories[0].type, "both");
    assert.ok(preview.rows.every((row) => row.input.description === "Travel"));
    assert.ok(
      preview.errors.some(
        (error) => error.rowNumber === 4 && error.field === "Date",
      ),
    );
    const request = {
      raw,
      preview,
      mappings,
      fileName: "mixed.csv",
      hash: hash(text),
      createCategories: false,
      allowDuplicate: false,
    };
    await assert.rejects(() => commitImport(db, request), /Approve/);
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT COUNT(*) AS n FROM categories WHERE name='Travel'",
        )
      ).n,
      0,
    );
    const result = await commitImport(db, {
      ...request,
      createCategories: true,
    });
    assert.equal(result.batch.skipped_count, 5);
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT type FROM categories WHERE name='Travel'",
        )
      ).type,
      "both",
    );
    assert.equal(await getAccountBalance(db, account.id), 50100);
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT initial_balance_cents FROM accounts WHERE id=?",
          account.id,
        )
      ).initial_balance_cents,
      50000,
    );
  }));
test("unexpected mid-import failure rolls back transactions, new categories and batch metadata; stale preview cannot silently remap", () =>
  fixture(async (db, account) => {
    const text =
      header +
      "2026-10-01,Expense,1,,Travel,Cash\n2026-10-01,Expense,2,FAIL,Travel,Cash";
    const raw = parseImportCsv(text);
    const preview = await previewImport(db, raw, {});
    const request = {
      raw,
      preview,
      mappings: {},
      fileName: "rollback.csv",
      hash: hash(text),
      createCategories: true,
      allowDuplicate: false,
    };
    await db.execAsync(
      "CREATE TRIGGER fail_import BEFORE INSERT ON transactions WHEN NEW.description='FAIL' BEGIN SELECT RAISE(ABORT,'simulated insert failure'); END;",
    );
    await assert.rejects(
      () => commitImport(db, request),
      /simulated insert failure/,
    );
    assert.equal(
      (await db.getFirstAsync("SELECT COUNT(*) AS n FROM transactions")).n,
      0,
    );
    assert.equal(
      (
        await db.getFirstAsync(
          "SELECT COUNT(*) AS n FROM categories WHERE name='Travel'",
        )
      ).n,
      0,
    );
    assert.equal(await previousImport(db, hash(text)), null);
    await db.runAsync(
      "UPDATE accounts SET name=? WHERE id=?",
      "Renamed",
      account.id,
    );
    await assert.rejects(() => commitImport(db, request), /changed/);
  }));
test("10,000-row import is atomic and duplicate-safe; interruption during a batch rolls back", () =>
  fixture(async (db, account) => {
    const text =
      header +
      Array.from(
        { length: 10000 },
        () => "2026-10-01,Expense,0.01,,Coffee,Cash",
      ).join("\n");
    const raw = parseImportCsv(text),
      preview = await previewImport(db, raw, {});
    const request = {
      raw,
      preview,
      mappings: {},
      fileName: "10000.csv",
      hash: hash(text),
      createCategories: false,
      allowDuplicate: false,
    };
    let done = 0;
    const started = performance.now();
    const result = await commitImport(db, request, (count) => {
      done = count;
    });
    assert.equal(result.batch.row_count, 10000);
    assert.equal(done, 10000);
    assert.equal(await getAccountBalance(db, account.id), 40000);
    console.log(
      `10000-row SQLite import: ${Math.round(performance.now() - started)}ms on desktop, native unmeasured.`,
    );
    const retry = { ...request, allowDuplicate: true };
    await assert.rejects(
      () =>
        commitImport(
          db,
          retry,
          (count) => {
            done = count;
          },
          () => {
            if (done === 100) throw new Error("cancelled");
          },
        ),
      /cancelled/,
    );
    assert.equal(
      (await db.getFirstAsync("SELECT COUNT(*) AS n FROM transactions")).n,
      10000,
    );
    assert.throws(
      () => parseImportCsv(text + "\n2026-10-01,Expense,0.01,,Coffee,Cash"),
      /10,000/,
    );
  }));
