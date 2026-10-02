import { useState } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { useSQLiteContext } from "expo-sqlite";
import type { Category } from "../../types/finance";
import {
  createCategory,
  updateCategory,
} from "../../database/repositories/categoryRepository";
import { useValidatedForm } from "../../hooks/useValidatedForm";
import { useFinanceStore } from "../../store/financeStore";
import { Body, Button, Input, Card } from "../ui";
import { ChoicePicker } from "../ui/Choice";
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a category name")
    .max(100, "Use at most 100 characters"),
  type: z.enum(["expense", "income", "both"]),
});
export function CategoryManagerForm({
  category,
  onDone,
}: {
  category: Category | null;
  onDone: () => void;
}) {
  const db = useSQLiteContext();
  const [error, setError] = useState<string | null>(null);
  const form = useValidatedForm(schema, {
    name: category?.name ?? "",
    type: category?.type ?? "expense",
  });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (category)
        await updateCategory(db, category.id, {
          ...values,
          icon: category.icon,
        });
      else await createCategory(db, values);
      useFinanceStore.getState().invalidate("Category saved");
      onDone();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save the category.",
      );
    }
  });
  return (
    <Card>
      <Body>{category ? "Edit category" : "Add Category"}</Body>
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Input
            label="Name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            editable={!form.formState.isSubmitting}
          />
        )}
      />
      <Controller
        control={form.control}
        name="type"
        render={({ field }) => (
          <ChoicePicker
            label="Type"
            value={field.value}
            onChange={field.onChange}
            disabled={form.formState.isSubmitting}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
              { value: "both", label: "Both" },
            ]}
          />
        )}
      />
      {error ? <Body>{error}</Body> : null}
      <Button
        title="Save category"
        disabled={form.formState.isSubmitting}
        onPress={() => void submit()}
      />
      <Button
        secondary
        title="Cancel"
        disabled={form.formState.isSubmitting}
        onPress={onDone}
      />
    </Card>
  );
}
