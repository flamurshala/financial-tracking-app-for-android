import { useState } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Screen, Card, SectionTitle, Body, Input, Button } from '../../components/ui';
import { signIn } from '../../services/auth';
import { isSupabaseConfigured } from '../../services/supabase';
import { synchronize } from '../../services/sync';
import { useAuthStore } from '../../store/authStore';
export default function Login() {
  const db = useSQLiteContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useAuthStore(state => state.session);
  const authError = useAuthStore(state => state.error);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await signIn(db, email, password);
      setPassword('');
      void synchronize(db);
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in. Please try again.');
    } finally { setBusy(false); }
  };
  return <Screen>
    <SectionTitle>Cloud account</SectionTitle>
    <Card>
      <Body>Your finances are stored on this device first. Sign in to synchronize and restore them on another phone.</Body>
      {!isSupabaseConfigured && <Body>Configure the Supabase project URL and public key in .env, then restart Expo. Local finances remain available.</Body>}
      {session && <Body>Signed in as {session.user.email}</Body>}
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy} />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!busy} onSubmitEditing={() => { if (!busy && isSupabaseConfigured) void submit(); }} />
      {error && <Body>{error}</Body>}
      {authError && <Body>{authError}</Body>}
      <Button title={busy ? 'Signing in…' : 'Sign In'} disabled={busy || !isSupabaseConfigured} onPress={() => { void submit(); }} />
      <Body>Create your personal user in the Supabase dashboard first. No registration or onboarding is required in the app.</Body>
    </Card>
  </Screen>;
}
