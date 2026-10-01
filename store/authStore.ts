import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
export const useAuthStore = create<{
  session: Session | null; ready: boolean; error: string | null;
  setSession: (session: Session | null) => void;
  setReady: (ready: boolean, error?: string | null) => void;
}>(set => ({ session: null, ready: false, error: null, setSession: session => set({ session, error: null }), setReady: (ready, error = null) => set({ ready, error }) }));
