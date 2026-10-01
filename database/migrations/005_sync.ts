import type { Migration } from '../schema';
export const syncMigration: Migration = {
  version: 5, name: 'sync_revision_and_server_version',
  up: async db => {
    for (const table of ['accounts', 'categories', 'transactions']) {
      await db.execAsync(`
        ALTER TABLE ${table} ADD COLUMN local_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE ${table} ADD COLUMN server_version INTEGER NOT NULL DEFAULT 0;
        CREATE TRIGGER ${table}_pending_revision AFTER UPDATE ON ${table}
        WHEN NEW.sync_status = 'pending' AND NEW.local_revision = OLD.local_revision
        BEGIN
          UPDATE ${table} SET local_revision = OLD.local_revision + 1 WHERE id = NEW.id;
        END;
      `);
    }
  },
};
