import type { Migration } from '../schema';
import { defaultExpenseCategories, defaultIncomeCategories } from '../../constants/categories';
export const defaultCategoriesMigration: Migration = {
  version: 3, name: 'default_categories',
  up: async (db) => {
    const timestamp = new Date().toISOString();
    const seeds = [
      ...defaultExpenseCategories.map((name) => ({ name, type: 'expense' })),
      ...defaultIncomeCategories.map((name) => ({ name, type: 'income' })),
    ];
    for (const [index, category] of seeds.entries()) {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      await db.runAsync('INSERT INTO categories (id, name, type, is_default, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING', id, category.name, category.type, timestamp, timestamp);
    }
  },
};
