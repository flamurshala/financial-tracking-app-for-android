import type { Migration } from '../schema';
export const migrations: readonly Migration[] = [{
  version: 1, name: 'foundation_metadata',
  up: async (db) => { await db.execAsync('CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);'); },
}];
