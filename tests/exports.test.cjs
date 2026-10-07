const { Buffer } = require("node:buffer");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { database } = require("./helpers.cjs");
const { initializeDatabase } = require("../database/database.ts");
const {
  createAccount,
} = require("../database/repositories/accountRepository.ts");
const {
  createTransaction,
  softDeleteTransaction,
} = require("../database/repositories/transactionRepository.ts");
const {
  writeCsv,
  writeJsonBackup,
} = require("../database/repositories/exportRepository.ts");
const { csvCell } = require("../utils/exportCsv.ts");
const {
  getAccountBalances,
} = require("../database/repositories/financeReadRepository.ts");
const { withReadSnapshot } = require("../database/repositories/shared.ts");

test("CSV preserves Unicode/quotes/newlines, exact cents, filtered matches and adjustments; JSON excludes secrets", async () => {
  const { sqlite, adapter: db } = database();
  try {
    await initializeDatabase(db);
    const account = await createAccount(db, {
      name: "Cash, €",
      type: "cash",
      initial_balance_cents: 50000,
    });
    const category = sqlite
      .prepare("SELECT id FROM categories WHERE type='expense' LIMIT 1")
      .get();
    const base = {
      account_id: account.id,
      category_id: category.id,
      type: "expense",
      transaction_date: "2026-10-01",
      is_balance_adjustment: false,
    };
    await createTransaction(db, {
      ...base,
      amount_cents: 5160,
      description: 'Çaj me Elonën, "drinks"\nO\'Brien',
    });
    await createTransaction(db, {
      ...base,
      category_id: null,
      is_balance_adjustment: true,
      amount_cents: 900,
      description: "Balance Adjustment",
    });
    const deleted = await createTransaction(db, {
      ...base,
      amount_cents: 100,
      description: "deleted-row",
    });
    await softDeleteTransaction(db, deleted.id);
    await db.runAsync(
      "INSERT INTO app_metadata(key,value) VALUES ('access_token','SECRET'),('local_owner_user_id','PRIVATE'),('settings.theme','dark')",
    );
    let csv = "";
    assert.equal(
      await writeCsv(db, {}, (text) => {
        csv += text;
      }),
      2,
    );
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes('"51.60"'));
    assert.ok(csv.includes('"Çaj me Elonën, ""drinks""\nO\'Brien"'));
    assert.ok(csv.includes('"true"'));
    assert.ok(!csv.includes("deleted-row"));
    let filtered = "";
    assert.equal(
      await writeCsv(
        db,
        { search: "Elonën", fromDate: "2026-10-01", toDate: "2026-10-01" },
        (text) => {
          filtered += text;
        },
      ),
      1,
    );
    assert.ok(!filtered.includes("Balance Adjustment"));
    let json = "";
    await writeJsonBackup(db, (text) => {
      json += text;
    });
    const backup = JSON.parse(json);
    assert.equal(backup.schema_version, 6);
    assert.equal(backup.transactions.length, 3);
    assert.equal(backup.preferences["settings.theme"], "dark");
    assert.ok(!json.includes("SECRET"));
    assert.ok(!json.includes("PRIVATE"));
    assert.ok(!json.includes("sync_status"));
    assert.equal(
      backup.transactions.find((row) => row.id === deleted.id).deleted_at !==
        null,
      true,
    );
    assert.equal(csvCell('  =HYPERLINK("a")', true), '"\'  =HYPERLINK(""a"")"');
    assert.equal(csvCell("Çaj O'Brien", true), '"Çaj O\'Brien"');
  } finally {
    sqlite.close();
  }
});

test("110,000-row ledger uses bounded export batches, SQL balances and a read-only WAL snapshot", async () => {
  const { sqlite, adapter: db } = database();
  try {
    await initializeDatabase(db);
    const account = await createAccount(db, {
      name: "Cash",
      type: "cash",
      initial_balance_cents: 50000,
    });
    const category = sqlite
      .prepare("SELECT id FROM categories WHERE type='expense' LIMIT 1")
      .get();
    const insert = sqlite.prepare(
      "INSERT INTO transactions(id,account_id,category_id,type,amount_cents,description,transaction_date,is_balance_adjustment,created_at,updated_at,deleted_at,sync_status,description_search) VALUES (?,?,?,'expense',1,'Çaj','2026-10-01',0,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',NULL,'pending','caj')",
    );
    sqlite.exec("BEGIN");
    for (let n = 0; n < 110000; n++)
      insert.run(
        `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        account.id,
        category.id,
      );
    sqlite.exec("COMMIT");
    let bytes = 0,
      maxChunk = 0;
    const start = performance.now();
    const count = await writeCsv(db, {}, (chunk) => {
      bytes += Buffer.byteLength(chunk);
      maxChunk = Math.max(maxChunk, Buffer.byteLength(chunk));
    });
    assert.equal(count, 110000);
    assert.ok(maxChunk < 200000);
    assert.ok(bytes > 1000000);
    const balances = await getAccountBalances(db);
    assert.equal(balances[0].balance_cents, -60000);
    await withReadSnapshot(db, async (tx) => {
      const before = await tx.getFirstAsync(
        "SELECT COUNT(*) AS n FROM transactions",
      );
      await db.runAsync(
        "UPDATE transactions SET deleted_at='2026-10-02T00:00:00Z' WHERE id=?",
        "00000000-0000-4000-8000-000000000000",
      );
      assert.equal(
        (
          await tx.getFirstAsync(
            "SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL",
          )
        ).n,
        before.n,
      );
      await assert.rejects(() =>
        tx.runAsync("UPDATE accounts SET name='oops'"),
      );
    });
    console.log(
      `110000-row desktop SQLite export: ${Math.round(performance.now() - start)}ms; bytes=${bytes}; largest chunk=${maxChunk}. Native device speed is unmeasured.`,
    );
    await assert.rejects(
      () =>
        writeCsv(
          db,
          {},
          () => {},
          () => {
            throw new Error("cancelled");
          },
        ),
      /cancelled/,
    );
    await assert.rejects(() =>
      writeCsv(db, { fromDate: "2026-02-30" }, () => {}),
    );
  } finally {
    sqlite.close();
  }
});
