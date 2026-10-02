const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers.cjs");
const Module = require("node:module");
const values = new Map();
let promptOptions = null;
let successful = true;
let writeFailure = false;
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "react-native") return { Platform: { OS: "android" } };
  if (name === "expo-secure-store")
    return {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value, options) => {
        assert.equal(options.keychainAccessible, "device-only");
        if (writeFailure) throw Error("Storage failed");
        values.set(key, value);
      },
    };
  if (name === "expo-local-authentication")
    return {
      AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
      hasHardwareAsync: async () => true,
      isEnrolledAsync: async () => true,
      supportedAuthenticationTypesAsync: async () => [1],
      authenticateAsync: async (options) => {
        promptOptions = options;
        return successful
          ? { success: true }
          : { success: false, error: "user_cancel" };
      },
    };
  return load.call(this, name, ...args);
};
const { appLock } = require("../services/appLock.ts");
test("native adapter enables only with biometrics and preserves device-local SecureStore settings on restart/failure", async () => {
  await appLock.initialize();
  await appLock.enableAppLock();
  assert.equal(promptOptions.disableDeviceFallback, true);
  const raw = values.get("finance.app-lock.v1");
  assert.deepEqual(JSON.parse(raw), { enabled: true, timeout: 60000 });
  delete require.cache[require.resolve("../services/appLock.ts")];
  const restart = require("../services/appLock.ts").appLock;
  await restart.initialize();
  assert.equal(restart.getSnapshot().locked, true);
  await restart.unlockApp();
  assert.equal(promptOptions.disableDeviceFallback, false);
  assert.equal(restart.getSnapshot().locked, false);
  successful = false;
  await restart.disableAppLock();
  assert.equal(restart.getSnapshot().settings.enabled, true);
  assert.match(restart.getSnapshot().error, /canceled/);
  successful = true;
  writeFailure = true;
  await restart.disableAppLock();
  assert.equal(values.get("finance.app-lock.v1"), raw);
  assert.equal(restart.getSnapshot().settings.enabled, true);
});
test("malformed secure settings never silently disable protection", async () => {
  values.set("finance.app-lock.v1", '{"enabled":true,"timeout":-1}');
  delete require.cache[require.resolve("../services/appLock.ts")];
  const restored = require("../services/appLock.ts").appLock;
  await restored.initialize();
  assert.equal(restored.getSnapshot().ready, false);
  assert.equal(restored.getSnapshot().locked, true);
});
