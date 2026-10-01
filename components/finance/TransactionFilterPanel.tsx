import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { useSQLiteContext } from "expo-sqlite";
import { Card, Button, Input } from "../ui";
import { ChoicePicker } from "../ui/Choice";
import { DateField } from "./DateField";
import { QueryState } from "../ui/QueryState";
import { useTheme } from "../../hooks/useTheme";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { useValidatedForm } from "../../hooks/useValidatedForm";
import { getAccounts } from "../../database/repositories/accountRepository";
import { getCategories } from "../../database/repositories/categoryRepository";
import { calendarDateSchema, localCalendarDate } from "../../utils/dates";
import { decimalField } from "../../utils/entryForm";
import { decimalToCents } from "../../utils/currency";
import { getPeriodRange } from "../../utils/periods";
import type { TransactionFilters } from "../../types/statistics";
const optionalAmount = z
  .string()
  .refine(
    (value) => !value.trim() || decimalField(true).safeParse(value).success,
    "Use a valid amount with up to two decimal places",
  );
const schema = z
  .object({
    type: z.enum(["", "expense", "income"]),
    category: z.string(),
    account: z.string(),
    preset: z.enum(["all", "day", "week", "month", "year", "custom"]),
    start: calendarDateSchema,
    end: calendarDateSchema,
    minimum: optionalAmount,
    maximum: optionalAmount,
  })
  .superRefine((value, context) => {
    if (value.preset === "custom" && value.start > value.end)
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "End date must be on or after start date",
      });
    if (
      value.minimum.trim() &&
      value.maximum.trim() &&
      decimalField(true).safeParse(value.minimum).success &&
      decimalField(true).safeParse(value.maximum).success &&
      decimalToCents(value.minimum) > decimalToCents(value.maximum)
    )
      context.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Maximum must be at least the minimum",
      });
  });
const initial = () => ({
  type: "" as const,
  category: "",
  account: "",
  preset: "all" as const,
  start: localCalendarDate(),
  end: localCalendarDate(),
  minimum: "",
  maximum: "",
});
export function TransactionFilterPanel({
  filters,
  onApply,
}: {
  filters: TransactionFilters;
  onApply: (filters: TransactionFilters) => void;
}) {
  const db = useSQLiteContext();
  const colors = useTheme();
  const [open, setOpen] = useState(false);
  const form = useValidatedForm(schema, initial());
  const reset = form.reset;
  useEffect(() => {
    if (!Object.keys(filters).length) reset(initial());
  }, [filters, reset]);
  const query = useLocalQuery(
    useCallback(
      async () => ({
        accounts: await getAccounts(db, true),
        categories: await getCategories(db, { includeArchived: true }),
      }),
      [db],
    ),
  );
  const count =
    Number(Boolean(filters.type)) +
    Number(Boolean(filters.categoryId)) +
    Number(Boolean(filters.accountId)) +
    Number(Boolean(filters.fromDate || filters.toDate)) +
    Number(filters.minAmountCents !== undefined) +
    Number(filters.maxAmountCents !== undefined);
  const submit = () =>
    form.handleSubmit((values) => {
      const next: TransactionFilters = {};
      if (values.type) next.type = values.type;
      if (values.category) next.categoryId = values.category;
      if (values.account) next.accountId = values.account;
      if (values.preset === "custom")
        Object.assign(next, { fromDate: values.start, toDate: values.end });
      else if (values.preset !== "all")
        Object.assign(next, getPeriodRange(values.preset, localCalendarDate()));
      if (values.minimum.trim())
        next.minAmountCents = decimalToCents(values.minimum);
      if (values.maximum.trim())
        next.maxAmountCents = decimalToCents(values.maximum);
      onApply(next);
      setOpen(false);
    })();
  return (
    <View style={{ gap: 12 }}>
      <Button
        secondary
        title={`Filters (${count})${open ? " · Close" : ""}`}
        onPress={() => setOpen(!open)}
      />
      {count ? (
        <Button
          secondary
          title="Clear All Filters"
          onPress={() => {
            form.reset(initial());
            onApply({});
          }}
        />
      ) : null}
      {open ? (
        <Card>
          <QueryState
            loading={query.loading}
            error={query.error}
            retry={query.refresh}
          />
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <ChoicePicker
                label="Transaction type"
                value={field.value}
                options={[
                  { value: "", label: "All" },
                  { value: "expense", label: "Expense" },
                  { value: "income", label: "Income" },
                ]}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <ChoicePicker
                label="Category"
                value={field.value}
                options={[
                  { value: "", label: "All categories" },
                  ...(query.data?.categories.map((category) => ({
                    value: category.id,
                    label: `${category.name} · ${category.type}${category.is_archived ? " (archived)" : ""}`,
                  })) ?? []),
                ]}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={form.control}
            name="account"
            render={({ field }) => (
              <ChoicePicker
                label="Account"
                value={field.value}
                options={[
                  { value: "", label: "All accounts" },
                  ...(query.data?.accounts.map((account) => ({
                    value: account.id,
                    label:
                      account.name + (account.is_archived ? " (archived)" : ""),
                  })) ?? []),
                ]}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={form.control}
            name="preset"
            render={({ field }) => (
              <ChoicePicker
                label="Date preset"
                value={field.value}
                options={[
                  { value: "all", label: "All dates" },
                  { value: "day", label: "Today" },
                  { value: "week", label: "This Week" },
                  { value: "month", label: "This Month" },
                  { value: "year", label: "This Year" },
                  { value: "custom", label: "Custom" },
                ]}
                onChange={field.onChange}
              />
            )}
          />
          {form.watch("preset") === "custom" ? (
            <>
              <DateField
                label="Start Date"
                shortcuts={false}
                value={form.watch("start")}
                onChange={(value) => form.setValue("start", value)}
              />
              <DateField
                label="End Date"
                shortcuts={false}
                value={form.watch("end")}
                onChange={(value) => form.setValue("end", value)}
                error={form.formState.errors.end?.message}
              />
            </>
          ) : null}
          {(["minimum", "maximum"] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field, fieldState }) => (
                <Input
                  label={
                    name === "minimum"
                      ? "Minimum amount · EUR"
                      : "Maximum amount · EUR"
                  }
                  keyboardType="decimal-pad"
                  placeholder="No limit"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  maxLength={20}
                />
              )}
            />
          ))}
          {form.formState.errors.root ? (
            <Text style={{ color: colors.text }}>
              {form.formState.errors.root.message}
            </Text>
          ) : null}
          <Button title="Apply filters" onPress={() => void submit()} />
        </Card>
      ) : null}
    </View>
  );
}
