import { useCallback, useRef } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Controller } from "react-hook-form";
import { z } from "zod";
import {
  Screen,
  Body,
  Button,
  Card,
  Input,
  SectionTitle,
  EmptyState,
} from "../../../components/ui";
import { QueryState } from "../../../components/ui/QueryState";
import { DateField } from "../../../components/finance/DateField";
import { useValidatedForm } from "../../../hooks/useValidatedForm";
import { useLocalQuery } from "../../../hooks/useLocalQuery";
import { useTheme } from "../../../hooks/useTheme";
import { useIsMounted } from "../../../hooks/useIsMounted";
import {
  getAccountById,
  getAccountBalance,
} from "../../../database/repositories/accountRepository";
import { adjustAccountBalance } from "../../../services/finance";
import { useFinanceStore } from "../../../store/financeStore";
import { calendarDateSchema, localCalendarDate } from "../../../utils/dates";
import { decimalField, signedDecimalToCents } from "../../../utils/entryForm";
import { formatAmount, sumCents } from "../../../utils/currency";
import { currency } from "../../../constants/config";
import { reportError } from "../../../utils/errors";
const schema = z.object({
  actual: decimalField(true, true),
  date: calendarDateSchema,
});
export default function AdjustBalance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const colors = useTheme();
  const busy = useRef(false);
  const isMounted = useIsMounted();
  const invalidate = useFinanceStore((state) => state.invalidate);
  const form = useValidatedForm(schema, {
    actual: "",
    date: localCalendarDate(),
  });
  const loader = useCallback(async () => {
    const account = await getAccountById(db, id);
    return account
      ? { account, balance: await getAccountBalance(db, id) }
      : null;
  }, [db, id]);
  const query = useLocalQuery(loader);
  let preview: string | null = null;
  const actual = form.watch("actual");
  if (query.data && schema.shape.actual.safeParse(actual).success) {
    try {
      const difference = sumCents([
        signedDecimalToCents(actual),
        -query.data.balance,
      ]);
      preview = `${difference > 0 ? "+" : ""}${formatAmount(difference)}`;
    } catch {
      preview = "Difference exceeds the supported amount range";
    }
  }
  const submit = () =>
    form.handleSubmit(async (values) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const record = await adjustAccountBalance(
          db,
          id,
          signedDecimalToCents(values.actual),
          values.date,
        );
        invalidate(record ? "Balance adjusted" : "Balance already matches");
        if (!isMounted()) return;
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/accounts");
      } catch (cause) {
        reportError("Balance adjustment failed", cause);
        form.setError("root", {
          message:
            "Could not adjust the balance. Verify the amount and that the account is active.",
        });
      } finally {
        busy.current = false;
      }
    })();
  if (!query.data)
    return (
      <Screen>
        <QueryState
          loading={query.loading}
          error={query.error}
          retry={query.refresh}
        />
        {!query.loading && !query.error ? (
          <EmptyState
            title="Account not found"
            description="Select an active account from Accounts."
          />
        ) : null}
      </Screen>
    );
  const pending = form.formState.isSubmitting;
  return (
    <Screen>
      <QueryState loading={false} error={query.error} retry={query.refresh} />
      <SectionTitle>{query.data.account.name}</SectionTitle>
      <Card>
        <Body>Calculated balance</Body>
        <SectionTitle>{formatAmount(query.data.balance)}</SectionTitle>
        <Body>
          A balance adjustment records the difference as a transaction. Your
          opening balance and previous entries are preserved.
        </Body>
      </Card>
      {query.data.account.is_archived ? (
        <Body>This account is archived. Adjustments are unavailable.</Body>
      ) : (
        <>
          <Controller
            name="actual"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                label={`Actual balance · ${currency.code}`}
                keyboardType="numbers-and-punctuation"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                editable={!pending}
                placeholder="0.00"
                maxLength={21}
              />
            )}
          />
          {preview ? <Body>Adjustment: {preview}</Body> : null}
          <DateField
            value={form.watch("date")}
            onChange={(date) =>
              form.setValue("date", date, { shouldValidate: true })
            }
            disabled={pending}
            error={form.formState.errors.date?.message}
          />
          {form.formState.errors.root ? (
            <Text accessibilityRole="alert" style={{ color: colors.text }}>
              {form.formState.errors.root.message}
            </Text>
          ) : null}
          <Button
            title={pending ? "Saving…" : "Confirm adjustment"}
            disabled={pending || query.loading}
            onPress={() => void submit()}
          />
        </>
      )}
    </Screen>
  );
}
