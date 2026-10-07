const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
require("./helpers.cjs");
let selection = { canceled: true },
  bytes = new Uint8Array(),
  size = 0,
  reads = 0;
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "expo-document-picker")
    return {
      getDocumentAsync: async (options) => {
        assert.equal(options.copyToCacheDirectory, true);
        assert.equal(options.multiple, false);
        return selection;
      },
    };
  if (request === "expo-file-system")
    return {
      File: class {
        get size() {
          return size;
        }
        async bytes() {
          reads++;
          return bytes;
        }
      },
    };
  if (request === "expo-crypto")
    return {
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digestStringAsync: async (_algorithm, text) =>
        require("node:crypto").createHash("sha256").update(text).digest("hex"),
    };
  return original.call(this, request, parent, isMain);
};
const { chooseImportCsv } = require("../services/csvImport.ts");
test("system picker cancellation, UTF-8 selection, fingerprint and invalid file safeguards", async () => {
  assert.equal(await chooseImportCsv(), null);
  assert.equal(reads, 0);
  selection = {
    canceled: false,
    assets: [{ name: "finance.csv", uri: "private-cache/selection.csv" }],
  };
  bytes = new TextEncoder().encode(
    "\uFEFFDate,Type,Amount,Description,Category,Account\n2026-10-07,Expense,1.50,Çaj,Coffee,Cash",
  );
  size = bytes.length;
  const result = await chooseImportCsv();
  assert.equal(result.rows[0].description, "Çaj");
  assert.match(result.hash, /^[a-f0-9]{64}$/);
  selection.assets[0].name = "finance.json";
  await assert.rejects(chooseImportCsv(), /Choose a .csv/);
  selection.assets[0].name = "finance.csv";
  selection.assets[0].size = 6 * 1024 * 1024;
  await assert.rejects(chooseImportCsv(), /5 MB/);
  delete selection.assets[0].size;
  bytes = new Uint8Array([0xff]);
  size = 1;
  await assert.rejects(chooseImportCsv(), /valid UTF-8/);
  bytes = new TextEncoder().encode("bad,headers");
  size = bytes.length;
  await assert.rejects(chooseImportCsv(), /Missing Date/);
});
