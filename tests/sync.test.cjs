const { test } = require("node:test");
const assert = require("node:assert/strict");
const { database } = require("./helpers.cjs");
const { initializeDatabase } = require("../database/database.ts");
const {
  createAccount,
  getAccountBalance,
  archiveAccount,
} = require("../database/repositories/accountRepository.ts");
const {
  getExpenseCategories,
  updateCategory,
} = require("../database/repositories/categoryRepository.ts");
const {
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
} = require("../database/repositories/transactionRepository.ts");
const { adjustAccountBalance } = require("../services/finance.ts");
const {
  getMetadata,
} = require("../database/repositories/metadataRepository.ts");
const {
  pendingCounts,
  toRemote,
  mergeRemote,
} = require("../database/repositories/syncRepository.ts");
const { SyncEngine } = require("../services/sync/syncEngine.ts");
const {
  previewImport,
  commitImport,
} = require("../database/repositories/importRepository.ts");
const { parseImportCsv } = require("../utils/csvImport.ts");
const user = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
test("imported pending transactions and approved categories sync and restore idempotently", async () => {
  const source = database(),
    destination = database(),
    api = cloud();
  try {
    await initializeDatabase(source.adapter);
    const account = await createAccount(source.adapter, {
      name: "Cash",
      type: "cash",
      initial_balance_cents: 10000,
    });
    const raw = parseImportCsv(
      "Date,Type,Amount,Description,Category,Account\n2026-10-07,Expense,1,,Travel,Cash\n2026-10-07,Income,2,,Travel,Cash",
    );
    const preview = await previewImport(source.adapter, raw, {});
    await commitImport(source.adapter, {
      raw,
      preview,
      mappings: {},
      fileName: "sync.csv",
      hash: "a".repeat(64),
      createCategories: true,
      allowDuplicate: false,
    });
    await new SyncEngine().run(source.adapter, api, context);
    assert.equal(api.tables.transactions.size, 2);
    assert.ok(
      [...api.tables.transactions.values()].every(
        (row) => row.description === "Travel",
      ),
    );
    assert.equal(
      [...api.tables.categories.values()].find((row) => row.name === "Travel")
        .type,
      "both",
    );
    await initializeDatabase(destination.adapter);
    const engine = new SyncEngine();
    await engine.run(destination.adapter, api, context);
    await engine.run(destination.adapter, api, context);
    assert.equal(
      await getAccountBalance(destination.adapter, account.id),
      10100,
    );
    assert.equal(
      (
        await destination.adapter.getFirstAsync(
          "SELECT COUNT(*) AS n FROM transactions",
        )
      ).n,
      2,
    );
    assert.equal((await pendingCounts(destination.adapter)).transactions, 0);
  } finally {
    source.sqlite.close();
    destination.sqlite.close();
  }
});
function cloud() {
  let version = 0;
  const tables = {
    accounts: new Map(),
    categories: new Map(),
    transactions: new Map(),
  };
  const api = {
    tables,
    pushes: 0,
    failTable: null,
    beforePush: null,
    beforePage: null,
    async push(table, row) {
      if (api.failTable === table) throw new Error("Disconnected");
      if (api.beforePush) await api.beforePush(table, row);
      if (table === "transactions") {
        assert.ok(tables.accounts.has(row.account_id));
        if (row.category_id) assert.ok(tables.categories.has(row.category_id));
      }
      const saved = {
        ...row,
        updated_at: new Date().toISOString(),
        sync_version: ++version,
      };
      tables[table].set(row.id, saved);
      api.pushes++;
      return saved;
    },
    async find(table, _user, id) {
      return tables[table].get(id) ?? null;
    },
    async cursor() {
      return version;
    },
    async page(table, _user, after, through, afterId) {
      if (api.beforePage) await api.beforePage(table);
      return [...tables[table].values()]
        .filter(
          (r) =>
            r.sync_version >= after &&
            r.sync_version <= through &&
            (!afterId || r.id > afterId),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 200);
    },
  };
  return api;
}
const context = { userId: user, isAuthorized: () => true };
async function setup() {
  const file = database();
  await initializeDatabase(file.adapter);
  const account = await createAccount(file.adapter, {
    name: "Cash",
    type: "cash",
    initial_balance_cents: 10000,
  });
  const category = (await getExpenseCategories(file.adapter))[0];
  const input = {
    account_id: account.id,
    category_id: category.id,
    type: "expense",
    amount_cents: 100,
    description: "Coffee",
    transaction_date: "2026-10-01",
  };
  return { file, account, category, input };
}
test("offline saves/restart, edit/delete/adjustment, archive, repeated sync, owner safety and restore", async () => {
  const { file, account, category, input } = await setup();
  const destination = database();
  const remote = cloud();
  const engine = new SyncEngine();
  try {
    const coffee = await createTransaction(file.adapter, input);
    const groceries = await createTransaction(file.adapter, {
      ...input,
      description: "Groceries",
      amount_cents: 800,
    });
    const fuel = await createTransaction(file.adapter, {
      ...input,
      description: "Fuel",
      amount_cents: 3000,
    });
    file.restart();
    assert.equal(await getAccountBalance(file.adapter, account.id), 6100);
    assert.equal((await pendingCounts(file.adapter)).transactions, 3);
    await engine.run(file.adapter, remote, context);
    assert.equal((await pendingCounts(file.adapter)).transactions, 0);
    await updateTransaction(file.adapter, fuel.id, {
      ...input,
      description: "Fuel",
      amount_cents: 3500,
    });
    await softDeleteTransaction(file.adapter, groceries.id);
    await adjustAccountBalance(file.adapter, account.id, 6800, "2026-10-01");
    await updateCategory(file.adapter, category.id, {
      name: "Personal coffee",
      type: "expense",
      icon: null,
    });
    await archiveAccount(file.adapter, account.id);
    assert.equal(await getAccountBalance(file.adapter, account.id), 6800);
    await engine.run(file.adapter, remote, context);
    assert.equal(remote.tables.transactions.get(fuel.id).amount_cents, 3500);
    assert.ok(remote.tables.transactions.get(groceries.id).deleted_at);
    assert.equal(remote.tables.accounts.get(account.id).is_archived, true);
    const pushes = remote.pushes;
    for (let i = 0; i < 10; i++)
      await engine.run(file.adapter, remote, context);
    assert.equal(remote.pushes, pushes);
    assert.equal(remote.tables.transactions.size, 4);
    await assert.rejects(
      engine.run(file.adapter, remote, {
        userId: other,
        isAuthorized: () => true,
      }),
      /another cloud account/,
    );
    assert.equal(remote.pushes, pushes);
    await initializeDatabase(destination.adapter);
    await engine.run(destination.adapter, remote, context);
    assert.equal(
      await getAccountBalance(destination.adapter, account.id),
      6800,
    );
    assert.equal(
      (await destination.adapter.getAllAsync("SELECT * FROM categories"))
        .length,
      25,
    );
    assert.equal(
      (
        await destination.adapter.getFirstAsync(
          "SELECT name FROM categories WHERE id=?",
          category.id,
        )
      ).name,
      "Personal coffee",
    );
    assert.equal(
      (
        await destination.adapter.getFirstAsync(
          "SELECT * FROM transactions WHERE id=?",
          coffee.id,
        )
      ).transaction_date,
      "2026-10-01",
    );
    assert.equal(
      await getMetadata(destination.adapter, "local_owner_user_id"),
      user,
    );
  } finally {
    file.sqlite.close();
    destination.sqlite.close();
  }
});
test("partial failure preserves pending records/cursor and recovers without duplicates", async () => {
  const { file, input, account } = await setup();
  const api = cloud();
  const engine = new SyncEngine();
  try {
    await createTransaction(file.adapter, input);
    api.failTable = "transactions";
    await assert.rejects(
      engine.run(file.adapter, api, context),
      /Disconnected/,
    );
    assert.equal((await pendingCounts(file.adapter)).accounts, 0);
    assert.equal((await pendingCounts(file.adapter)).transactions, 1);
    assert.equal(await getMetadata(file.adapter, "cloud_sync_cursor"), null);
    assert.equal(await getAccountBalance(file.adapter, account.id), 9900);
    api.failTable = null;
    await engine.run(file.adapter, api, context);
    assert.equal(api.tables.transactions.size, 1);
    assert.equal((await pendingCounts(file.adapter)).transactions, 0);
  } finally {
    file.sqlite.close();
  }
});
test("single-flight lock and in-flight edit do not acknowledge or overwrite a newer local revision", async () => {
  const { file, input } = await setup();
  const api = cloud();
  const engine = new SyncEngine();
  try {
    const row = await createTransaction(file.adapter, input);
    let edited = false;
    api.beforePush = async (table) => {
      if (table === "transactions" && !edited) {
        edited = true;
        await updateTransaction(file.adapter, row.id, {
          ...input,
          amount_cents: 500,
        });
      }
    };
    const first = engine.run(file.adapter, api, context);
    assert.equal(engine.run(file.adapter, api, context), first);
    const result = await first;
    assert.equal(result.pending, 1);
    assert.equal(
      (
        await file.adapter.getFirstAsync(
          "SELECT amount_cents FROM transactions WHERE id=?",
          row.id,
        )
      ).amount_cents,
      500,
    );
    await engine.run(file.adapter, api, context);
    assert.equal(api.tables.transactions.get(row.id).amount_cents, 500);
    assert.equal(api.tables.transactions.size, 1);
  } finally {
    file.sqlite.close();
  }
});
test("pull errors roll back references and cursor; signout interrupts an in-flight cycle", async () => {
  const { file, input, account } = await setup();
  const api = cloud();
  const engine = new SyncEngine();
  try {
    await createTransaction(file.adapter, input);
    await engine.run(file.adapter, api, context);
    const cursor = await getMetadata(file.adapter, "cloud_sync_cursor");
    const local = await file.adapter.getFirstAsync(
      "SELECT * FROM transactions LIMIT 1",
    );
    await api
      .push("transactions", {
        ...toRemote("transactions", local, user),
        account_id: "20000000-0000-4000-8000-000000000001",
      })
      .catch(() => {});
    // Directly simulate an invalid remote FK to prove atomic local rejection.
    api.tables.transactions.set(local.id, {
      ...toRemote("transactions", local, user),
      account_id: "20000000-0000-4000-8000-000000000001",
      sync_version: Number(cursor) + 1,
    });
    api.cursor = async () => Number(cursor) + 1;
    await assert.rejects(engine.run(file.adapter, api, context), /FOREIGN KEY/);
    assert.equal(await getMetadata(file.adapter, "cloud_sync_cursor"), cursor);
    assert.equal(await getAccountBalance(file.adapter, account.id), 9900);
    let authorized = true;
    api.beforePage = async () => {
      authorized = false;
    };
    await assert.rejects(
      engine.run(file.adapter, api, {
        userId: user,
        isAuthorized: () => authorized,
      }),
      /Session/,
    );
    assert.equal(await getMetadata(file.adapter, "cloud_sync_cursor"), cursor);
  } finally {
    file.sqlite.close();
  }
});
test("remote pending protection and unsafe cloud amounts reject without changing local data", async () => {
  const { file, input } = await setup();
  try {
    const row = await createTransaction(file.adapter, input);
    const record = await file.adapter.getFirstAsync(
      "SELECT * FROM transactions WHERE id=?",
      row.id,
    );
    const remote = toRemote("transactions", record, user);
    await mergeRemote(
      file.adapter,
      "transactions",
      { ...remote, amount_cents: 1 },
      user,
    );
    assert.equal(
      (
        await file.adapter.getFirstAsync(
          "SELECT amount_cents FROM transactions WHERE id=?",
          row.id,
        )
      ).amount_cents,
      100,
    );
    await assert.rejects(
      mergeRemote(
        file.adapter,
        "transactions",
        { ...remote, amount_cents: Number.MAX_SAFE_INTEGER + 1 },
        user,
      ),
    );
    await assert.rejects(
      mergeRemote(
        file.adapter,
        "transactions",
        { ...remote, user_id: other },
        user,
      ),
      /owner/,
    );
  } finally {
    file.sqlite.close();
  }
});

test("more than two network pages restore idempotently with tombstones and Unicode search", async () => {
  const { file, account, category } = await setup();
  const destination = database();
  const api = cloud();
  const engine = new SyncEngine();
  try {
    for (let i = 0; i < 425; i++) {
      await file.adapter.runAsync(
        "INSERT INTO transactions(id,account_id,category_id,type,amount_cents,description,description_search,transaction_date,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        require("node:crypto").randomUUID(),
        account.id,
        category.id,
        "expense",
        1,
        "CAFÉ",
        "cafe",
        "2026-10-01",
        "2099-01-01T00:00:00Z",
        "2099-01-01T00:00:00Z",
        i < 5 ? "2026-10-01T00:00:00Z" : null,
      );
    }
    await engine.run(file.adapter, api, context);
    await initializeDatabase(destination.adapter);
    await engine.run(destination.adapter, api, context);
    await engine.run(destination.adapter, api, context);
    assert.equal(
      (
        await destination.adapter.getFirstAsync(
          "SELECT COUNT(*) AS count FROM transactions",
        )
      ).count,
      425,
    );
    assert.equal(
      await getAccountBalance(destination.adapter, account.id),
      9580,
    );
    assert.equal(
      (
        await destination.adapter.getFirstAsync(
          "SELECT description_search FROM transactions LIMIT 1",
        )
      ).description_search,
      "café",
    );
    assert.equal((await pendingCounts(destination.adapter)).transactions, 0);
  } finally {
    file.sqlite.close();
    destination.sqlite.close();
  }
});
