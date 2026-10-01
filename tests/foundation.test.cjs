const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const ts = require('typescript');
// Compile the actual foundation sources, using real SQLite behind the Expo-shaped adapter.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
global.__DEV__ = false;
const { initializeDatabase } = require('../database/database.ts');
const { setMetadata, getMetadata } = require('../database/repositories/metadataRepository.ts');
const { calendarDateSchema, displayCalendarDate, localCalendarDate } = require('../utils/dates.ts');
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const adapter = {
    execAsync: async (sql) => { sqlite.exec(sql); },
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params) ?? null,
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (callback) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await callback(adapter); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, adapter };
}
test('initialization is repeatable and preserves parameterized data', async () => {
  const { sqlite, adapter } = database();
  try {
    await initializeDatabase(adapter);
    await setMetadata(adapter, "quote'; DROP TABLE app_metadata; --", 'retained');
    await initializeDatabase(adapter);
    assert.equal(await getMetadata(adapter, "quote'; DROP TABLE app_metadata; --"), 'retained');
    assert.equal((await adapter.getAllAsync('SELECT * FROM schema_migrations')).length, 1);
    assert.equal((await adapter.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
  } finally { sqlite.close(); }
});
test('newer database versions are rejected without deleting data', async () => {
  const { sqlite, adapter } = database();
  try {
    await initializeDatabase(adapter);
    await setMetadata(adapter, 'retained', 'yes');
    await adapter.runAsync('INSERT INTO schema_migrations VALUES (?, ?, ?)', 99, 'future', 'future');
    await assert.rejects(initializeDatabase(adapter), /Local database/);
    assert.equal(await getMetadata(adapter, 'retained'), 'yes');
  } finally { sqlite.close(); }
});
test('failed migration rolls back without recording success', async () => {
  const { sqlite, adapter } = database();
  try {
    await adapter.execAsync('CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT)');
    await assert.rejects(initializeDatabase(adapter));
    assert.equal(await adapter.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'"), null);
  } finally { sqlite.close(); }
});
test('calendar dates reject impossible dates and preserve local date', () => {
  assert.equal(calendarDateSchema.safeParse('2026-02-29').success, false);
  assert.equal(calendarDateSchema.safeParse('2024-02-29').success, true);
  assert.equal(calendarDateSchema.safeParse('2026-13-01').success, false);
  assert.equal(localCalendarDate(new Date(2026, 9, 1, 0, 5)), '2026-10-01');
  assert.equal(displayCalendarDate('2026-10-01'), '1 Oct 2026');
});
