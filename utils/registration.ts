import { z } from "zod";
export const registrationSchema = z
  .object({
    email: z
      .email("Enter a valid email address.")
      .transform((value) => value.trim()),
    password: z
      .string()
      .min(8, "Use at least 8 characters for your password.")
      .max(128, "Use at most 128 characters."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
export function registrationMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
  if (code === "user_already_exists" || code === "email_exists")
    return "This email is already registered. Sign in instead.";
  if (code === "email_address_invalid" || code === "validation_failed")
    return "Check your email address and password.";
  if (code === "weak_password")
    return "Choose a stronger password that meets the project requirements.";
  if (code === "signup_disabled")
    return "Account registration is currently disabled. Contact the app developer.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  )
    return "Too many attempts. Please try again later.";
  return "Registration failed. Check your connection and try again.";
}
