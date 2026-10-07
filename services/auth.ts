import type { Session } from "@supabase/supabase-js";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";
import { getSupabaseClient, authStorageKey } from "./supabase";
import { secureSessionStorage } from "./secureStorage";
import { useAuthStore } from "../store/authStore";
import { useSyncStore } from "../store/syncStore";
import {
  assertLocalOwner,
  OwnerMismatchError,
} from "../database/repositories/syncRepository";
import { registrationSchema, registrationMessage } from "../utils/registration";
export async function signUp(
  db: SQLiteDatabase,
  email: string,
  password: string,
  confirmPassword: string,
): Promise<"authenticated" | "confirmation"> {
  const checked = registrationSchema.safeParse({
    email: email.trim(),
    password,
    confirmPassword,
  });
  if (!checked.success) throw new Error(checked.error.issues[0].message);
  let result: Awaited<
    ReturnType<ReturnType<typeof getSupabaseClient>["auth"]["signUp"]>
  >;
  try {
    result = await getSupabaseClient().auth.signUp({
      email: checked.data.email,
      password: checked.data.password,
    });
  } catch {
    throw new Error(
      "Unable to connect. Check your internet connection and cloud configuration.",
    );
  }
  if (result.error) throw new Error(registrationMessage(result.error));
  if (!result.data.user)
    throw new Error("Registration failed. Please try again.");
  if (!result.data.session) return "confirmation";
  try {
    await assertLocalOwner(db, result.data.session.user.id);
  } catch (ownerError) {
    await signOut();
    throw new Error(authMessage(ownerError));
  }
  acceptSession(result.data.session);
  return "authenticated";
}
export let authGeneration = 0;
let signingOut = false;
export function acceptSession(session: Session | null) {
  if (signingOut && session) return;
  if (useAuthStore.getState().session?.user.id !== session?.user.id)
    authGeneration++;
  useAuthStore.getState().setSession(session);
}
export function authMessage(error: unknown): string {
  if (error instanceof OwnerMismatchError) return error.message;
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "invalid_credentials")
      return "Invalid email or password.";
    if (error.code === "email_not_confirmed")
      return "Confirm your email address before signing in.";
    if (
      error.code === "over_request_rate_limit" ||
      error.code === "over_email_send_rate_limit"
    )
      return "Too many attempts. Please try again later.";
  }
  return "Unable to sign in. Check your internet connection and account details.";
}
export async function signIn(
  db: SQLiteDatabase,
  email: string,
  password: string,
) {
  if (!z.email().safeParse(email.trim()).success)
    throw new Error("Email address is not valid.");
  if (!password) throw new Error("Enter your password.");
  let result: Awaited<
    ReturnType<
      ReturnType<typeof getSupabaseClient>["auth"]["signInWithPassword"]
    >
  >;
  try {
    result = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
  } catch {
    throw new Error(
      "Unable to sign in. Check your cloud configuration and internet connection.",
    );
  }
  const { data, error } = result;
  if (error || !data.session) throw new Error(authMessage(error));
  try {
    await assertLocalOwner(db, data.session.user.id);
  } catch (ownerError) {
    await signOut();
    throw new Error(authMessage(ownerError));
  }
  acceptSession(data.session);
}
export async function signOut() {
  signingOut = true;
  authGeneration++; // Immediately stops further push/merge work from this session.
  useAuthStore.getState().setSession(null);
  useSyncStore
    .getState()
    .setState({ status: "Not Authenticated", error: null });
  const client = getSupabaseClient();
  client.auth.stopAutoRefresh();
  try {
    // Local scope revokes this device's refresh token; other devices remain signed in.
    const { error } = await client.auth.signOut({ scope: "local" });
    // Current SDK clears its session on network failures too. Explicit storage
    // cleanup also covers failure while loading/refreshing an expired session.
    if (error)
      return "Signed out on this device. Server revocation could not be confirmed while offline.";
    return null;
  } catch {
    return "Signed out on this device. Server revocation could not be confirmed while offline.";
  } finally {
    try {
      await secureSessionStorage.removeItem(authStorageKey);
    } finally {
      signingOut = false;
    }
  }
}
