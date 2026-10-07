const { test } = require("node:test");
const assert = require("node:assert/strict");
const { database } = require("./helpers.cjs");
const Module = require("node:module");
let mode = "confirmation",
  calls = 0;
const id = "10000000-0000-4000-8000-000000000001";
const original = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === "./supabase" && parent.filename.endsWith("auth.ts"))
    return {
      authStorageKey: "test.auth",
      getSupabaseClient: () => ({
        auth: {
          signUp: async (input) => {
            calls++;
            assert.equal(input.email, "me@example.com");
            assert.equal(input.password, "password-123");
            if (mode === "throw") throw new Error("native request failure");
            if (mode === "existing")
              return {
                data: { user: null, session: null },
                error: { code: "user_already_exists" },
              };
            return {
              error: null,
              data: {
                user: { id },
                session:
                  mode === "session"
                    ? {
                        user: { id, email: input.email },
                        access_token: "synthetic",
                      }
                    : null,
              },
            };
          },
          stopAutoRefresh: () => {},
          signOut: async () => ({ error: null }),
        },
      }),
    };
  if (name === "./secureStorage" && parent.filename.endsWith("auth.ts"))
    return { secureSessionStorage: { removeItem: async () => {} } };
  return original.call(this, name, parent, isMain);
};
const { signUp, acceptSession } = require("../services/auth.ts");
const { useAuthStore } = require("../store/authStore.ts");
const { initializeDatabase } = require("../database/database.ts");
test("signup validates locally, handles confirmation/session/error and preserves owner isolation", async () => {
  const file = database();
  try {
    await initializeDatabase(file.adapter);
    acceptSession(null);
    await assert.rejects(
      () => signUp(file.adapter, "bad", "password-123", "password-123"),
      /valid email/,
    );
    await assert.rejects(
      () => signUp(file.adapter, "me@example.com", "short", "short"),
      /8 characters/,
    );
    await assert.rejects(
      () => signUp(file.adapter, "me@example.com", "password-123", "different"),
      /must match/,
    );
    assert.equal(calls, 0);
    assert.equal(
      await signUp(
        file.adapter,
        " me@example.com ",
        "password-123",
        "password-123",
      ),
      "confirmation",
    );
    assert.equal(useAuthStore.getState().session, null);
    mode = "session";
    assert.equal(
      await signUp(
        file.adapter,
        "me@example.com",
        "password-123",
        "password-123",
      ),
      "authenticated",
    );
    assert.equal(useAuthStore.getState().session.user.id, id);
    acceptSession(null);
    mode = "existing";
    await assert.rejects(
      () =>
        signUp(file.adapter, "me@example.com", "password-123", "password-123"),
      /already registered/,
    );
    mode = "throw";
    await assert.rejects(
      () =>
        signUp(file.adapter, "me@example.com", "password-123", "password-123"),
      /Unable to connect/,
    );
    mode = "session";
    await file.adapter.runAsync(
      "INSERT OR REPLACE INTO app_metadata VALUES('local_owner_user_id','10000000-0000-4000-8000-000000000002')",
    );
    await assert.rejects(
      () =>
        signUp(file.adapter, "me@example.com", "password-123", "password-123"),
      /another cloud account/,
    );
    assert.equal(useAuthStore.getState().session, null);
  } finally {
    file.sqlite.close();
  }
});
