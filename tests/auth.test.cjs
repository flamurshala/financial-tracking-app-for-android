const { test } = require('node:test');
const assert = require('node:assert/strict');
const { database } = require('./helpers.cjs');
const Module = require('node:module');
const values = new Map();
let failure = false;
const previousLoad = Module._load;
const user = '10000000-0000-4000-8000-000000000001';
let nextUser = user;
const auth = {
  async signInWithPassword({ email, password }) {
    assert.equal(email, 'me@example.com'); assert.equal(password, 'test-password');
    return { data: { session: { user: { id: nextUser, email }, access_token: 'test-token' } }, error: null };
  },
  stopAutoRefresh() {},
  async signOut({ scope }) { assert.equal(scope, 'local'); return { error: { code: 'network_error' } }; },
};
Module._load = function (name, ...args) {
  if (name === 'expo-secure-store') return {
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key,value) => { if (failure && !key.endsWith('.manifest')) throw new Error('Interrupted secure write'); values.set(key,value); },
    deleteItemAsync: async key => { values.delete(key); },
  };
  if (name === './supabase' && args[0]?.filename.endsWith('auth.ts')) return { getSupabaseClient: () => ({ auth }), authStorageKey: 'test.auth' };
  return previousLoad.call(this, name, ...args);
};
const { secureSessionStorage } = require('../services/secureStorage.ts');
const { signIn, signOut, acceptSession } = require('../services/auth.ts');
const { useAuthStore } = require('../store/authStore.ts');
const { initializeDatabase } = require('../database/database.ts');
const { setMetadata } = require('../database/repositories/metadataRepository.ts');
test('chunked SecureStore session survives replacement failure, supports Unicode and removes logout session', async () => {
  const original = 'session-' + 'é👛'.repeat(1000);
  await secureSessionStorage.setItem('test.auth', original);
  assert.equal(await secureSessionStorage.getItem('test.auth'), original);
  failure = true;
  await assert.rejects(secureSessionStorage.setItem('test.auth', 'new session'), /Interrupted/);
  failure = false;
  assert.equal(await secureSessionStorage.getItem('test.auth'), original);
  await secureSessionStorage.setItem('test.auth', 'updated session');
  assert.equal(await secureSessionStorage.getItem('test.auth'), 'updated session');
  await secureSessionStorage.removeItem('test.auth');
  assert.equal(await secureSessionStorage.getItem('test.auth'), null);
  assert.equal(values.size, 0);
});
test('login validation, matching owner, mismatched account blocked and offline signout preserves SQLite', async () => {
  const file = database();
  try {
    await initializeDatabase(file.adapter);
    await setMetadata(file.adapter, 'local_owner_user_id', user);
    await assert.rejects(signIn(file.adapter, 'invalid', 'test-password'), /Email address/);
    await assert.rejects(signIn(file.adapter, 'me@example.com', ''), /password/);
    await signIn(file.adapter, 'me@example.com', 'test-password');
    assert.equal(useAuthStore.getState().session.user.id, user);
    await secureSessionStorage.setItem('test.auth', 'session');
    const notice = await signOut();
    assert.match(notice, /Server revocation/);
    assert.equal(useAuthStore.getState().session, null);
    assert.equal(await secureSessionStorage.getItem('test.auth'), null);
    assert.equal((await file.adapter.getAllAsync('SELECT * FROM categories')).length,25);
    nextUser = '10000000-0000-4000-8000-000000000002';
    await assert.rejects(signIn(file.adapter, 'me@example.com', 'test-password'), /another cloud account/);
    assert.equal(useAuthStore.getState().session,null);
    file.restart();
    assert.equal((await file.adapter.getFirstAsync("SELECT value FROM app_metadata WHERE key='local_owner_user_id'")).value,user);
    nextUser = user;
    await signIn(file.adapter, 'me@example.com', 'test-password');
    acceptSession(null);
    assert.equal(useAuthStore.getState().session,null);
  } finally { file.sqlite.close(); }
});
