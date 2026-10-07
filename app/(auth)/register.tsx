import { useRef, useState } from "react";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Screen,
  Card,
  Body,
  SectionTitle,
  Input,
  Button,
} from "../../components/ui";
import { signUp } from "../../services/auth";
import { synchronize } from "../../services/sync";
import { isSupabaseConfigured } from "../../services/supabase";
export default function Register() {
  const db = useSQLiteContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const running = useRef(false);
  const submit = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await signUp(db, email, password, confirm);
      setPassword("");
      setConfirm("");
      if (result === "authenticated") {
        void synchronize(db);
        router.replace("/(tabs)");
      } else
        setNotice(
          "Check your email to confirm your account before signing in. If you already have an account, use Sign In.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to create account. Please retry.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <SectionTitle>Create Account</SectionTitle>
      <Card>
        <Body>
          Create your cloud sign-in account here. Your finances remain on this
          device first.
        </Body>
        {!isSupabaseConfigured ? (
          <Body>
            Cloud registration is unavailable until the developer configures
            Supabase.
          </Body>
        ) : null}
        {notice ? (
          <Body>{notice}</Body>
        ) : (
          <>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              editable={!busy}
              maxLength={254}
            />
            <Input
              label="Password (at least 8 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              editable={!busy}
              maxLength={128}
            />
            <Input
              label="Confirm Password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              editable={!busy}
              maxLength={128}
            />
            {error ? <Body>{error}</Body> : null}
            <Button
              title={busy ? "Creating account…" : "Create Account"}
              disabled={busy || !isSupabaseConfigured}
              onPress={() => {
                void submit();
              }}
            />
          </>
        )}
        <Button
          secondary
          title="Sign In"
          disabled={busy}
          onPress={() => router.replace("/(auth)/login")}
        />
      </Card>
    </Screen>
  );
}
