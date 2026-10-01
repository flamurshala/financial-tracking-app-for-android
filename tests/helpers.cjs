const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
// Only the native UUID API is substituted. Repositories and SQL are the actual sources.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  return request === 'expo-crypto' ? { randomUUID: require('node:crypto').randomUUID } : originalLoad.call(this, request, parent, isMain);
};
global.__DEV__ = false;
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const bindings = (params) => params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  const adapter = {
    execAsync: async (sql) => { sqlite.exec(sql); },
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...bindings(params)),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...bindings(params)) ?? null,
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...bindings(params)),
    withExclusiveTransactionAsync: async (callback) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await callback(adapter); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, adapter };
}
module.exports = { database };
