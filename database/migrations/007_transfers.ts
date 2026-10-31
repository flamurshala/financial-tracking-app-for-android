import type { Migration } from '../schema';
export const transfersMigration: Migration = {
  version: 7, name: 'account_transfers',
  up: async db => {
    await db.execAsync(`CREATE TABLE transfers (
      id TEXT PRIMARY KEY NOT NULL,
      from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 1 AND 9007199254740991),
      transfer_date TEXT NOT NULL CHECK(length(transfer_date)=10 AND transfer_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=2000),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','error')),
      local_revision INTEGER NOT NULL DEFAULT 0, server_version INTEGER NOT NULL DEFAULT 0,
      CHECK(from_account_id <> to_account_id)
    );
    CREATE INDEX transfers_from ON transfers(from_account_id) WHERE deleted_at IS NULL;
    CREATE INDEX transfers_to ON transfers(to_account_id) WHERE deleted_at IS NULL;
    CREATE INDEX transfers_date ON transfers(transfer_date DESC,created_at DESC,id) WHERE deleted_at IS NULL;
    CREATE INDEX transfers_sync ON transfers(sync_status,updated_at);
    CREATE TRIGGER transfers_pending_revision AFTER UPDATE ON transfers
      WHEN NEW.sync_status='pending' AND NEW.local_revision=OLD.local_revision
      BEGIN UPDATE transfers SET local_revision=OLD.local_revision+1 WHERE id=NEW.id; END;`);
  },
};
