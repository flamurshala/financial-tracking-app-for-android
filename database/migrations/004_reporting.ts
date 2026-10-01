import type { Migration } from "../schema";
import { normalizeSearchText } from "../../utils/search";
export const reportingMigration: Migration = {
  version: 4,
  name: "reporting_and_unicode_search",
  up: async (db) => {
    await db.execAsync(
      "ALTER TABLE transactions ADD COLUMN description_search TEXT NOT NULL DEFAULT ''; CREATE INDEX transactions_type_date_report ON transactions(type, transaction_date) WHERE deleted_at IS NULL AND is_balance_adjustment = 0;",
    );
    const rows = await db.getAllAsync<{ id: string; description: string }>(
      "SELECT id, description FROM transactions",
    );
    for (const row of rows)
      await db.runAsync(
        "UPDATE transactions SET description_search = ? WHERE id = ?",
        normalizeSearchText(row.description),
        row.id,
      );
  },
};
