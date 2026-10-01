import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
export const useAuthStore = create<{ session: Session | null; setSession: (session: Session | null) => void }>((set) => ({ session: null, setSession: (session) => set({ session }) }));
