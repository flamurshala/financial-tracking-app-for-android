import type { Migration } from "../schema";
export const importBatchesMigration: Migration = {
  version: 6,
  name: "local_csv_import_batches",
  up: async (db) => {
    await db.execAsync(`CREATE TABLE import_batches (
    id TEXT PRIMARY KEY NOT NULL,
    file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
    content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
    imported_at TEXT NOT NULL,
    row_count INTEGER NOT NULL CHECK(row_count>0),
    skipped_count INTEGER NOT NULL CHECK(skipped_count>=0)
  ); CREATE INDEX import_batches_hash ON import_batches(content_hash,imported_at DESC);`);
  },
};
