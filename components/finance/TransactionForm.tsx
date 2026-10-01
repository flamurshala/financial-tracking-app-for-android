import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Controller } from "react-hook-form";
import { useSQLiteContext } from "expo-sqlite";
import type { Transaction } from "../../types/finance";
import { getAccounts } from "../../database/repositories/accountRepository";
import { getCategories } from "../../database/repositories/categoryRepository";
import { getRecentDescriptions } from "../../database/repositories/financeReadRepository";
import { updateTransaction } from "../../database/repositories/transactionRepository";
import { getLastAccount, saveEntry } from "../../services/finance";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { useValidatedForm } from "../../hooks/useValidatedForm";
import { useTheme } from "../../hooks/useTheme";
import { useIsMounted } from "../../hooks/useIsMounted";
import {
  entryFormSchema,
  resetForAnother,
  type EntryFormValues,
} from "../../utils/entryForm";
import { centsToDecimal, decimalToCents } from "../../utils/currency";
import { localCalendarDate } from "../../utils/dates";
import { currency } from "../../constants/config";
import { reportError } from "../../utils/errors";
import { useFinanceStore } from "../../store/financeStore";
import { Body, Button, EmptyState, Input } from "../ui";
import { Chip, ChoicePicker } from "../ui/Choice";
import { QueryState } from "../ui/QueryState";
import { DateField } from "./DateField";
import { NewCategoryForm } from "./NewCategoryForm";
const quickNames = [
  "Coffee",
  "Drinks",
  "Groceries",
  "Food",
  "Lunch",
  "Dinner",
  "Fuel",
  "Rent",
  "Phone Top Up",
  "Parking",
  "Car",
  "Entertainment",
  "Other",
];
export function TransactionForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Transaction;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const db = useSQLiteContext();
  const colors = useTheme();
  const isMounted = useIsMounted();
  const amountRef = useRef<TextInput>(null);
  const busy = useRef(false);
  const [newCategory, setNewCategory] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const invalidate = useFinanceStore((state) => state.invalidate);
  const form = useValidatedForm(entryFormSchema, {
    type: initial?.type ?? "expense",
    amount: initial ? centsToDecimal(initial.amount_cents) : "",
    description: initial?.description ?? "",
    account_id: initial?.account_id ?? "",
    category_id: initial?.category_id ?? "",
    transaction_date: initial?.transaction_date ?? localCalendarDate(),
    is_balance_adjustment: Boolean(initial?.is_balance_adjustment),
  });
  const values = form.watch();
  const load = useCallback(
    async () => ({
      accounts: await getAccounts(db, true),
      categories: await getCategories(db, { includeArchived: true }),
      suggestions: await getRecentDescriptions(db, values.type),
      lastAccount: await getLastAccount(db),
    }),
    [db, values.type],
  );
  const query = useLocalQuery(load);
  const { setValue, getValues } = form;
  useEffect(() => {
    if (!query.data || getValues("account_id")) return;
    const active = query.data.accounts.filter(
      (account) => !account.is_archived,
    );
    const remembered = active.find(
      (account) => account.id === query.data?.lastAccount,
    );
    if (remembered || active.length === 1)
      setValue("account_id", remembered?.id ?? active[0].id);
  }, [query.data, setValue, getValues]);
  const submit = (another: boolean) =>
    form.handleSubmit(
      async (entry: EntryFormValues) => {
        if (busy.current) return;
        busy.current = true;
        setFeedback(null);
        try {
          const input = {
            ...entry,
            amount_cents: decimalToCents(entry.amount),
            category_id: entry.is_balance_adjustment ? null : entry.category_id,
          };
          if (initial) await updateTransaction(db, initial.id, input);
          else await saveEntry(db, input);
          invalidate(initial ? "Transaction updated" : "Saved locally");
          if (!isMounted()) return;
          if (another && !initial) {
            form.reset(resetForAnother(entry));
            setFeedback("Saved locally. Ready for the next entry.");
            requestAnimationFrame(() => amountRef.current?.focus());
          } else onSaved();
        } catch (cause) {
          reportError("Transaction save failed", cause);
          form.setError("root", {
            message:
              "Could not save. Check that your account and category are still available, then try again.",
          });
        } finally {
          busy.current = false;
        }
      },
      (errors) => {
        form.setError("root", {
          message: "Please check the highlighted fields.",
        });
        if (errors.amount) amountRef.current?.focus();
      },
    );
  const pending = form.formState.isSubmitting;
  if (!query.data)
    return (
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.refresh}
      />
    );
  const accounts = query.data.accounts.filter(
    (account) => !account.is_archived || account.id === initial?.account_id,
  );
  const categories = query.data.categories.filter(
    (category) =>
      (category.type === values.type || category.type === "both") &&
      (!category.is_archived || category.id === initial?.category_id),
  );
  const quick =
    values.type === "income"
      ? categories.filter((category) => !category.is_archived)
      : quickNames
          .map((name) =>
            categories.find(
              (category) => category.name === name && !category.is_archived,
            ),
          )
          .filter((category) => category !== undefined);
  if (!accounts.length)
    return (
      <>
        <EmptyState
          title="No accounts yet"
          description="Create an account to start tracking your money."
        />
        <Button
          title="Create account"
          onPress={() => router.push("/account/add")}
        />
      </>
    );
  return (
    <View style={{ gap: 24 }}>
      <QueryState loading={false} error={query.error} retry={query.refresh} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip
          label="Expense"
          selected={values.type === "expense"}
          disabled={pending || newCategory}
          onPress={() => {
            if (values.type === "expense") return;
            setValue("type", "expense");
            setValue("category_id", "");
            setNewCategory(false);
          }}
        />
        <Chip
          label="Income"
          selected={values.type === "income"}
          disabled={pending || newCategory}
          onPress={() => {
            if (values.type === "income") return;
            setValue("type", "income");
            setValue("category_id", "");
            setNewCategory(false);
          }}
        />
      </View>
      {values.is_balance_adjustment ? (
        <Body>
          This is a balance adjustment. Editing changes the accounting
          correction; it remains excluded from income and spending summaries.
        </Body>
      ) : null}
      <Controller
        control={form.control}
        name="amount"
        render={({ field, fieldState }) => (
          <Input
            inputRef={amountRef}
            label={`Amount · ${currency.code} ${currency.symbol}`}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="decimal-pad"
            autoFocus={!initial}
            placeholder="0.00"
            maxLength={20}
            editable={!pending}
            error={fieldState.error?.message}
            style={{
              fontSize: 36,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
            }}
          />
        )}
      />
      <Controller
        control={form.control}
        name="description"
        render={({ field, fieldState }) => (
          <Input
            label="Description"
            placeholder="What was it for?"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            editable={!pending}
            maxLength={2000}
            error={fieldState.error?.message}
          />
        )}
      />
      {!initial && query.data.suggestions.length ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {query.data.suggestions.map((description) => (
            <Chip
              key={description}
              label={description}
              disabled={pending || newCategory}
              onPress={() =>
                setValue("description", description, { shouldValidate: true })
              }
            />
          ))}
        </ScrollView>
      ) : null}
      {!values.is_balance_adjustment ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.text }}>Quick categories</Text>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {quick.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={values.category_id === category.id}
                disabled={pending || newCategory}
                onPress={() =>
                  setValue("category_id", category.id, { shouldValidate: true })
                }
              />
            ))}
          </ScrollView>
          <ChoicePicker
            label="More Categories"
            value={values.category_id}
            options={categories.map((category) => ({
              value: category.id,
              label:
                category.name + (category.is_archived ? " (archived)" : ""),
            }))}
            onChange={(id) =>
              setValue("category_id", id, { shouldValidate: true })
            }
            error={form.formState.errors.category_id?.message}
            disabled={pending || newCategory}
          />
          {newCategory ? (
            <NewCategoryForm
              type={values.type}
              onCreated={(id) => {
                setValue("category_id", id);
                setNewCategory(false);
              }}
              onCancel={() => setNewCategory(false)}
            />
          ) : (
            <Button
              secondary
              disabled={pending || newCategory}
              title="+ New Category"
              onPress={() => setNewCategory(true)}
            />
          )}
        </View>
      ) : null}
      <ChoicePicker
        label="Account"
        value={values.account_id}
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name + (account.is_archived ? " (archived)" : ""),
        }))}
        onChange={(id) => setValue("account_id", id, { shouldValidate: true })}
        error={form.formState.errors.account_id?.message}
        disabled={pending || newCategory}
      />
      <DateField
        value={values.transaction_date}
        onChange={(date) =>
          setValue("transaction_date", date, { shouldValidate: true })
        }
        error={form.formState.errors.transaction_date?.message}
        disabled={pending || newCategory}
      />
      {feedback ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.primary }}
        >
          {feedback}
        </Text>
      ) : null}
      {form.formState.errors.root ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {form.formState.errors.root.message}
        </Text>
      ) : null}
      <Button
        title={pending ? "Saving…" : "Save"}
        disabled={pending || newCategory}
        onPress={() => void submit(false)()}
      />
      {!initial ? (
        <Button
          secondary
          title="Save & Add Another"
          disabled={pending || newCategory}
          onPress={() => void submit(true)()}
        />
      ) : null}
      {onCancel ? (
        <Button
          secondary
          title="Cancel editing"
          disabled={pending || newCategory}
          onPress={onCancel}
        />
      ) : null}
    </View>
  );
}
