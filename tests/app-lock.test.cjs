const assert = require("node:assert/strict");
const { test } = require("node:test");
require("./helpers.cjs");
const {
  AppLockController,
  shouldLockOnForeground,
} = require("../services/security/appLockController.ts");
function fixture(initial = { enabled: false, timeout: 60000 }) {
  let settings = { ...initial };
  let time = 100000;
  let result = { success: true };
  let failure = false;
  let loadFailure = false;
  let capability = {
    hasHardware: true,
    enrolled: true,
    types: ["Fingerprint"],
  };
  let prompts = 0;
  let pending = null;
  const dependencies = {
    now: () => time,
    load: async () => {
      if (loadFailure) throw Error("SecureStore unavailable");
      return { ...settings };
    },
    save: async (value) => {
      if (failure) throw Error("Could not save security settings.");
      settings = { ...value };
    },
    capability: async () => capability,
    authenticate: async () => {
      prompts++;
      return pending ? await pending : result;
    },
  };
  return {
    controller: new AppLockController(dependencies),
    dependencies,
    get settings() {
      return settings;
    },
    get prompts() {
      return prompts;
    },
    advance(value) {
      time += value;
    },
    result(value) {
      result = value;
    },
    storageFailure(value) {
      failure = value;
    },
    loadFailure(value) {
      loadFailure = value;
    },
    capability(value) {
      capability = value;
    },
    pending(value) {
      pending = value;
    },
  };
}
test("startup is private before SecureStore resolves and locks every enabled cold start", async () => {
  const f = fixture({ enabled: true, timeout: 60000 });
  assert.equal(f.controller.getSnapshot().ready, false);
  assert.equal(f.controller.getSnapshot().locked, true);
  await f.controller.initialize();
  assert.equal(f.controller.getSnapshot().locked, true);
  await f.controller.unlockApp();
  assert.equal(f.controller.getSnapshot().locked, false);
  const restarted = new AppLockController(f.dependencies);
  await restarted.initialize();
  assert.equal(restarted.getSnapshot().locked, true);
});
test("enable, disable and timeout changes require verification and persist only after success", async () => {
  const f = fixture();
  await f.controller.initialize();
  f.result({ success: false, message: "Authentication canceled." });
  await f.controller.enableAppLock();
  assert.equal(f.settings.enabled, false);
  f.result({ success: true });
  await f.controller.enableAppLock();
  assert.equal(f.settings.enabled, true);
  f.result({ success: false });
  await f.controller.disableAppLock();
  assert.equal(f.settings.enabled, true);
  await f.controller.setTimeout(0);
  assert.equal(f.settings.timeout, 60000);
  f.result({ success: true });
  await f.controller.setTimeout(0);
  assert.equal(f.settings.timeout, 0);
  await f.controller.disableAppLock();
  assert.equal(f.settings.enabled, false);
  assert.equal(f.prompts, 6);
});
test("no hardware, no enrollment and thrown native errors leave the lock safe", async () => {
  const f = fixture();
  await f.controller.initialize();
  f.capability({ hasHardware: false, enrolled: false, types: [] });
  await f.controller.enableAppLock();
  assert.match(f.controller.getSnapshot().error, /not available/);
  assert.equal(f.prompts, 0);
  f.capability({
    hasHardware: true,
    enrolled: false,
    types: ["Face recognition"],
  });
  await f.controller.enableAppLock();
  assert.match(f.controller.getSnapshot().error, /Enroll/);
  assert.equal(f.settings.enabled, false);
  const g = fixture({ enabled: true, timeout: 60000 });
  g.dependencies.authenticate = async () => {
    throw Error("Authentication could not be opened");
  };
  await g.controller.initialize();
  await g.controller.unlockApp();
  assert.equal(g.controller.getSnapshot().locked, true);
  assert.match(g.controller.getSnapshot().error, /could not/);
});
test("20 seconds does not lock, one-minute boundary does, immediate mode and clock rollback lock", async () => {
  const f = fixture({ enabled: true, timeout: 60000 });
  await f.controller.initialize();
  await f.controller.unlockApp();
  f.controller.appState("background");
  assert.equal(f.controller.getSnapshot().backgrounded, true);
  f.advance(20000);
  f.controller.appState("active");
  assert.equal(f.controller.getSnapshot().locked, false);
  f.controller.appState("background");
  f.advance(60000);
  f.controller.appState("active");
  assert.equal(f.controller.getSnapshot().locked, true);
  await f.controller.unlockApp();
  await f.controller.setTimeout(0);
  f.controller.appState("background");
  f.controller.appState("active");
  assert.equal(f.controller.getSnapshot().locked, true);
  assert.equal(shouldLockOnForeground(100, 90, 60000), true);
});
test("system prompt inactive/active does not create a relock loop; actual background invalidates pending unlock", async () => {
  const f = fixture({ enabled: true, timeout: 0 });
  await f.controller.initialize();
  let finish;
  f.pending(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const unlocking = f.controller.unlockApp();
  f.controller.appState("inactive");
  f.controller.appState("active");
  finish({ success: true });
  await unlocking;
  assert.equal(f.controller.getSnapshot().locked, false);
  f.controller.lockApp();
  f.pending(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const interrupted = f.controller.unlockApp();
  f.controller.appState("background");
  f.controller.appState("active");
  finish({ success: true });
  await interrupted;
  assert.equal(f.controller.getSnapshot().locked, true);
  assert.match(f.controller.getSnapshot().error, /backgrounded/);
});
test("failed security reads and writes fail closed and do not overwrite enabled settings", async () => {
  const f = fixture({ enabled: true, timeout: 60000 });
  f.loadFailure(true);
  await f.controller.initialize();
  assert.equal(f.controller.getSnapshot().ready, false);
  assert.equal(f.controller.getSnapshot().locked, true);
  f.loadFailure(false);
  await f.controller.initialize();
  f.storageFailure(true);
  await f.controller.disableAppLock();
  assert.equal(f.controller.getSnapshot().settings.enabled, true);
  assert.equal(f.settings.enabled, true);
  assert.equal(f.controller.getSnapshot().busy, false);
});
test("rapid taps launch one prompt and unlock uses only device-local dependencies", async () => {
  const f = fixture({ enabled: true, timeout: 900000 });
  await f.controller.initialize();
  let finish;
  f.pending(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = f.controller.unlockApp();
  await f.controller.unlockApp();
  assert.equal(f.prompts, 1);
  finish({ success: true });
  await first;
  assert.equal(f.controller.getSnapshot().locked, false);
});
