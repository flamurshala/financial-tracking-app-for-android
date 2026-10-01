import type { Migration } from '../schema';
// Range/type constraints also protect callers that bypass the repository layer.
export const financeMigration: Migration = {
  version: 2, name: 'local_finance_schema',
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
        type TEXT NOT NULL CHECK(type IN ('cash','bank','card','savings','other')),
        currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency = 'EUR'),
        initial_balance_cents INTEGER NOT NULL CHECK(typeof(initial_balance_cents) = 'integer' AND initial_balance_cents BETWEEN -9007199254740991 AND 9007199254740991),
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','error'))
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
        type TEXT NOT NULL CHECK(type IN ('expense','income','both')),
        icon TEXT,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','error'))
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
        type TEXT NOT NULL CHECK(type IN ('expense','income')),
        amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 9007199254740991),
        description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 2000),
        transaction_date TEXT NOT NULL CHECK(length(transaction_date) = 10 AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        is_balance_adjustment INTEGER NOT NULL DEFAULT 0 CHECK(is_balance_adjustment IN (0,1)),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','error')),
        CHECK((is_balance_adjustment = 0 AND category_id IS NOT NULL) OR (is_balance_adjustment = 1 AND category_id IS NULL))
      );
      CREATE INDEX transactions_date_active ON transactions(transaction_date DESC, created_at DESC, id) WHERE deleted_at IS NULL;
      CREATE INDEX transactions_account_active ON transactions(account_id, transaction_date) WHERE deleted_at IS NULL;
      CREATE INDEX transactions_category_active ON transactions(category_id, transaction_date) WHERE deleted_at IS NULL;
      CREATE INDEX transactions_sync ON transactions(sync_status, updated_at);
      CREATE INDEX accounts_sync ON accounts(sync_status, updated_at);
      CREATE INDEX categories_sync ON categories(sync_status, updated_at);
    `);
  },
};
