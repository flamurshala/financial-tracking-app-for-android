const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function render(state) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(
      require.resolve("../components/security/AppLockGate.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react")
        return {
          useEffect() {},
          useState: () => [null, () => {}],
          useRef: () => ({ current: Promise.resolve() }),
          useSyncExternalStore: () => state,
        };
      if (name === "react-native")
        return {
          View: "View",
          Modal: "Modal",
          ActivityIndicator: "ActivityIndicator",
          Platform: { OS: "android" },
          StyleSheet: { absoluteFill: { position: "absolute" } },
        };
      if (name === "expo-screen-capture") return {};
      if (name.includes("appLock"))
        return { appLock: { subscribe() {}, getSnapshot() {} } };
      if (name.includes("useTheme"))
        return { useTheme: () => ({ background: "#fff", surface: "#eee" }) };
      if (name === "../ui")
        return { Body: "Text", Button: "Button", SectionTitle: "Text" };
      return require(name);
    },
  });
  return module.exports.AppLockGate({
    children: require("react").createElement("ProtectedRoutes", {
      notificationDestination: "/transaction/add",
    }),
  });
}
function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  fn(node);
  for (const child of [].concat(node.props?.children ?? [])) walk(child, fn);
}
test("cold-start and failed settings load never mount any protected route, including notification destination", () => {
  for (const state of [
    {
      ready: false,
      hasUnlocked: false,
      locked: true,
      settings: { enabled: false },
    },
    {
      ready: true,
      hasUnlocked: false,
      locked: true,
      settings: { enabled: true },
    },
  ]) {
    const tree = render(state);
    const routes = [];
    walk(tree, (node) => {
      if (node.type === "ProtectedRoutes") routes.push(node);
    });
    assert.equal(routes.length, 0);
  }
});
test("warm locked routes are hidden from touch/accessibility behind an uncloseable full-screen lock modal", () => {
  const tree = render({
    ready: true,
    hasUnlocked: true,
    locked: true,
    backgrounded: false,
    settings: { enabled: true },
  });
  const nodes = [];
  walk(tree, (node) => nodes.push(node));
  const hidden = nodes.find((node) => node.props?.pointerEvents === "none");
  assert.equal(hidden.props.style.opacity, 0);
  assert.equal(hidden.props.importantForAccessibility, "no-hide-descendants");
  const modal = nodes.find((node) => node.type === "Modal");
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.presentationStyle, "fullScreen");
  modal.props.onRequestClose();
  assert.equal(modal.props.visible, true);
});
