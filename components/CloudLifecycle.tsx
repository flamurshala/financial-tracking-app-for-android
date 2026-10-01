import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import { isSupabaseConfigured, getSupabaseClient } from '../services/supabase';
import { acceptSession, authGeneration } from '../services/auth';
import { synchronize, setSyncConnectivity, refreshSyncInfo } from '../services/sync';
import { useAuthStore } from '../store/authStore';
import { useFinanceStore } from '../store/financeStore';
import { useSyncStore } from '../store/syncStore';
export function CloudLifecycle() {
  const db = useSQLiteContext();
  useEffect(() => {
    if (!isSupabaseConfigured) {
      useAuthStore.getState().setReady(true);
      useSyncStore.getState().setState({ status: 'Not Configured' });
      return;
    }
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let rerun = false;
    let executing = false;
    const trigger = () => {
      if (!alive) return;
      if (executing) { rerun = true; return; }
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!alive) return;
        executing = true;
        rerun = false;
        void synchronize(db).finally(() => {
          executing = false;
          if (rerun && alive) { rerun = false; trigger(); }
        });
      }, 750);
    };
    let client: ReturnType<typeof getSupabaseClient>;
    try { client = getSupabaseClient(); }
    catch {
      useAuthStore.getState().setReady(true, 'Cloud configuration is invalid. Use the project URL and public key.');
      useSyncStore.getState().setState({ status: 'Error', error: 'Cloud configuration is invalid.' });
      return;
    }
    // No async Supabase calls inside auth callbacks: avoid auth lock reentry.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      acceptSession(session);
      useAuthStore.getState().setReady(true);
      trigger();
    });
    const restoreGeneration = authGeneration;
    void client.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (restoreGeneration === authGeneration) acceptSession(data.session);
      useAuthStore.getState().setReady(true, error ? 'Cloud session could not be restored. Local finances remain available.' : null);
      trigger();
    }).catch(() => { if (alive) useAuthStore.getState().setReady(true, 'Cloud session could not be restored. Local finances remain available.'); });
    void refreshSyncInfo(db).catch(() => undefined);
    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      setSyncConnectivity(state.isConnected === true && state.isInternetReachable !== false);
      trigger();
    });
    const unsubscribeFinance = useFinanceStore.subscribe((state, previous) => {
      if (state.revision !== previous.revision && state.changeSource === 'local') trigger();
    });
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    const appSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') { client.auth.startAutoRefresh(); trigger(); }
      else client.auth.stopAutoRefresh();
    });
    return () => {
      alive = false; clearTimeout(debounce); subscription.unsubscribe(); unsubscribeNetwork(); unsubscribeFinance(); appSubscription.remove(); client.auth.stopAutoRefresh();
    };
  }, [db]);
  return null;
}
