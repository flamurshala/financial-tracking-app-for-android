const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");
const os = require("node:os");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};
// Only the native UUID API is substituted. Repositories and SQL are the actual sources.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "expo-crypto")
    return { randomUUID: require("node:crypto").randomUUID };
  if (request === "expo-sqlite")
    return {
      openDatabaseAsync: async (name, _options, directory) =>
        connection(path.join(directory, name)).adapter,
    };
  return originalLoad.call(this, request, parent, isMain);
};
global.__DEV__ = false;
function connection(filename) {
  const sqlite = new DatabaseSync(filename, {
    enableForeignKeyConstraints: false,
  });
  const bindings = (params) =>
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  const adapter = {
    databasePath: filename.replace(/\\/g, "/"),
    options: {},
    closeAsync: async () => sqlite.close(),
    execAsync: async (sql) => {
      sqlite.exec(sql);
    },
    getAllAsync: async (sql, ...params) =>
      sqlite.prepare(sql).all(...bindings(params)),
    getFirstAsync: async (sql, ...params) =>
      sqlite.prepare(sql).get(...bindings(params)) ?? null,
    runAsync: async (sql, ...params) =>
      sqlite.prepare(sql).run(...bindings(params)),
    withExclusiveTransactionAsync: async (callback) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        await callback(adapter);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, adapter };
}
function database() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "finance-tests-"));
  const result = connection(path.join(directory, "finance.db"));
  let originalClose = result.sqlite.close.bind(result.sqlite);
  const closeAndClean = () => {
    originalClose();
    if (
      path.dirname(directory) !== os.tmpdir() ||
      !path.basename(directory).startsWith("finance-tests-")
    )
      throw new Error("Unexpected test cleanup path");
    fs.rmSync(directory, { recursive: true, force: true });
  };
  result.sqlite.close = closeAndClean;
  result.restart = () => {
    originalClose();
    const reopened = connection(path.join(directory, "finance.db"));
    result.sqlite = reopened.sqlite;
    result.adapter = reopened.adapter;
    originalClose = reopened.sqlite.close.bind(reopened.sqlite);
    result.sqlite.close = closeAndClean;
    return result;
  };
  return result;
}
module.exports = { database };
