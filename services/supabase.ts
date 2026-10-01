import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(url && key);
let client: SupabaseClient | null = null;
// Lazy initialization keeps local startup independent of credentials and network.
export function getSupabaseClient(): SupabaseClient {
  if (!url || !key) throw new Error('Set Supabase public environment variables before enabling cloud features.');
  client ??= createClient(url, key, { auth: { storage: secureSessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
  return client;
}
