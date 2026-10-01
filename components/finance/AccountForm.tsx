import { useRef } from "react";
import { Text, View } from "react-native";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { useSQLiteContext } from "expo-sqlite";
import type { Account } from "../../types/finance";
import { useValidatedForm } from "../../hooks/useValidatedForm";
import { useTheme } from "../../hooks/useTheme";
import { useIsMounted } from "../../hooks/useIsMounted";
import {
  createAccount,
  updateAccount,
} from "../../database/repositories/accountRepository";
import { centsToDecimal } from "../../utils/currency";
import { decimalField, signedDecimalToCents } from "../../utils/entryForm";
import { reportError } from "../../utils/errors";
import { currency } from "../../constants/config";
import { useFinanceStore } from "../../store/financeStore";
import { Body, Button, Input } from "../ui";
import { ChoicePicker } from "../ui/Choice";
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter an account name")
    .max(100, "Use at most 100 characters"),
  type: z.enum(["cash", "bank", "card", "savings", "other"]),
  initial: decimalField(true, true),
});
export function AccountForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Account;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const db = useSQLiteContext();
  const colors = useTheme();
  const busy = useRef(false);
  const isMounted = useIsMounted();
  const invalidate = useFinanceStore((state) => state.invalidate);
  const form = useValidatedForm(schema, {
    name: initial?.name ?? "",
    type: initial?.type ?? "cash",
    initial: initial ? centsToDecimal(initial.initial_balance_cents) : "0.00",
  });
  const submit = () =>
    form.handleSubmit(async (values) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const input = {
          name: values.name,
          type: values.type,
          currency: currency.code,
          initial_balance_cents: signedDecimalToCents(values.initial),
        };
        if (initial) await updateAccount(db, initial.id, input);
        else await createAccount(db, input);
        invalidate(initial ? "Account updated" : "Account created");
        if (isMounted()) onSaved();
      } catch (cause) {
        reportError("Account save failed", cause);
        form.setError("root", {
          message: "Could not save the account. Please try again.",
        });
      } finally {
        busy.current = false;
      }
    })();
  const pending = form.formState.isSubmitting;
  return (
    <View style={{ gap: 24 }}>
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Input
            label="Account name"
            placeholder="Cash, Bank, Card…"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            editable={!pending}
            maxLength={100}
          />
        )}
      />
      <Controller
        name="type"
        control={form.control}
        render={({ field }) => (
          <ChoicePicker
            label="Account type"
            value={field.value}
            options={["cash", "bank", "card", "savings", "other"].map(
              (type) => ({
                value: type,
                label: type.charAt(0).toUpperCase() + type.slice(1),
              }),
            )}
            onChange={field.onChange}
            disabled={pending}
          />
        )}
      />
      <Controller
        name="initial"
        control={form.control}
        render={({ field, fieldState }) => (
          <Input
            label={`Initial balance · ${currency.code}`}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="numbers-and-punctuation"
            error={fieldState.error?.message}
            editable={!pending}
            maxLength={21}
          />
        )}
      />
      <Body>Currency: {currency.code}</Body>
      {initial ? (
        <Body>
          This is the opening balance. To record a change to the money you
          currently hold, use Adjust Balance.
        </Body>
      ) : (
        <Body>
          Enter how much money you have in this account before recording any
          transactions.
        </Body>
      )}
      {form.formState.errors.root ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {form.formState.errors.root.message}
        </Text>
      ) : null}
      <Button
        title={pending ? "Saving…" : "Save account"}
        disabled={pending}
        onPress={() => void submit()}
      />
      {onCancel ? (
        <Button
          secondary
          title="Cancel editing"
          disabled={pending}
          onPress={onCancel}
        />
      ) : null}
    </View>
  );
}
