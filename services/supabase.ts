import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';
import type { CloudDatabase } from '../types/sync';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(url && key);
export const authStorageKey = 'finance.auth.session';
let client: SupabaseClient<CloudDatabase> | null = null;
// Lazy initialization keeps local startup independent of credentials and network.
export function getSupabaseClient(): SupabaseClient<CloudDatabase> {
  if (!url || !key) throw new Error('Set Supabase public environment variables before enabling cloud features.');
  if (key.startsWith('sb_secret_')) throw new Error('Only a public Supabase key is allowed.');
  if (key.split('.').length === 3) {
    const payload: unknown = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload !== 'object' || payload === null || !('role' in payload) || payload.role !== 'anon') throw new Error('Only an anon/public Supabase key is allowed.');
  }
  client ??= createClient<CloudDatabase>(url, key, { auth: { storage: secureSessionStorage, storageKey: authStorageKey, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    init?.signal?.addEventListener('abort', abort);
    if (init?.signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 20000);
    try { return await fetch(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timeout); init?.signal?.removeEventListener('abort', abort); }
  } } });
  return client;
}
