import { router } from 'expo-router';
import { Screen, Card, SectionTitle, Body, Button } from '../../components/ui';
import { useSettingsStore } from '../../store/settingsStore';
import { currency } from '../../constants/config';
import { isSupabaseConfigured } from '../../services/supabase';
export default function Settings() {
  const setTheme = useSettingsStore((state) => state.setTheme);
  return <Screen><SectionTitle>Preferences</SectionTitle><Card><Body>Primary currency: {currency.code}</Body><Body>Appearance preferences apply to this session.</Body><Button title="Use device appearance" onPress={() => setTheme('system')} /><Button title="Light appearance" onPress={() => setTheme('light')} /><Button title="Dark appearance" onPress={() => setTheme('dark')} /></Card><Card><Body>Cloud configuration: {isSupabaseConfigured ? 'provided' : 'not configured'}</Body><Body>Cloud backup, reminders and biometric locking are prepared for future phases.</Body><Button title="Cloud account" onPress={() => router.push('/(auth)/login')} /></Card></Screen>;
}
