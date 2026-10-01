const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function harness() {
  const slots = [];
  let cursor = 0;
  let effectCursor = 0;
  const effects = [];
  let pending = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index])
        slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[index].value,
        (value) => {
          slots[index].value =
            typeof value === "function" ? value(slots[index].value) : value;
        },
      ];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || deps.some((value, i) => value !== old.deps[i]))
        slots[index] = { value: callback, deps };
      return slots[index].value;
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(
      require.resolve("../hooks/useLocalQuery.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    setTimeout: () => 0,
    clearTimeout: () => {},
    Date,
    require(name) {
      if (name === "react") return react;
      if (name === "react-native")
        return { AppState: { addEventListener: () => ({ remove() {} }) } };
      if (name === "expo-router")
        return {
          useFocusEffect(callback) {
            const index = effectCursor++;
            if (effects[index]?.callback !== callback)
              pending.push(() => {
                effects[index]?.cleanup?.();
                effects[index] = { callback, cleanup: callback() };
              });
          },
        };
      if (name.includes("financeStore")) return { useFinanceStore: () => 0 };
      if (name.includes("errors")) return { reportError() {} };
      throw new Error(name);
    },
  });
  return {
    render(loader) {
      cursor = 0;
      effectCursor = 0;
      pending = [];
      return module.exports.useLocalQuery(loader);
    },
    flush() {
      for (const effect of pending) effect();
      pending = [];
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("period switch hides the old report before focus effects run and ignores obsolete results", async () => {
  const h = harness();
  const month = () => Promise.resolve({ period: "month", highestDay: null });
  let finishWeek;
  const week = () =>
    new Promise((resolve) => {
      finishWeek = resolve;
    });
  let finishYear;
  const year = () =>
    new Promise((resolve) => {
      finishYear = resolve;
    });
  h.render(month);
  h.flush();
  await tick();
  assert.equal(h.render(month).data.period, "month");
  const switching = h.render(week);
  assert.equal(switching.data, null);
  assert.equal(switching.loading, true);
  h.flush();
  assert.equal(h.render(year).data, null);
  h.flush();
  finishWeek({ period: "week" });
  await tick();
  assert.equal(h.render(year).data, null);
  finishYear({ period: "year", highestMonth: { month: "2026-10" } });
  await tick();
  const ready = h.render(year);
  assert.equal(ready.data.period, "year");
  assert.equal(ready.loading, false);
});
test("a failed replacement report finishes loading and exposes its error instead of stale data", async () => {
  const h = harness();
  const initial = () => Promise.resolve({ period: "month" });
  const failed = () => Promise.reject(new Error("Query failed"));
  h.render(initial);
  h.flush();
  await tick();
  h.render(failed);
  h.flush();
  await tick();
  const result = h.render(failed);
  assert.equal(result.loading, false);
  assert.equal(result.data, null);
  assert.match(result.error, /Could not load/);
});

