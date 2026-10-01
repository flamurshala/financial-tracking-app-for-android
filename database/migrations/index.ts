import type { Migration } from '../schema';
import { financeMigration } from './002_finance';
import { defaultCategoriesMigration } from './003_default_categories';
export const migrations: readonly Migration[] = [{
  version: 1, name: 'foundation_metadata',
  up: async (db) => { await db.execAsync('CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);'); },
}, financeMigration, defaultCategoriesMigration];
