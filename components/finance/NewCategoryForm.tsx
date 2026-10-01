import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { useSQLiteContext } from "expo-sqlite";
import type { TransactionType } from "../../types/finance";
import { useValidatedForm } from "../../hooks/useValidatedForm";
import { createCategory } from "../../database/repositories/categoryRepository";
import { useFinanceStore } from "../../store/financeStore";
import { reportError } from "../../utils/errors";
import { Button, Input } from "../ui";
import { useTheme } from "../../hooks/useTheme";
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a category name")
    .max(100, "Use at most 100 characters"),
});
export function NewCategoryForm({
  type,
  onCreated,
  onCancel,
}: {
  type: TransactionType;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const db = useSQLiteContext();
  const colors = useTheme();
  const invalidate = useFinanceStore((state) => state.invalidate);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const form = useValidatedForm(schema, { name: "" });
  const submit = () =>
    form.handleSubmit(async (values) => {
      if (busy.current) return;
      busy.current = true;
      setError(null);
      try {
        const category = await createCategory(db, { name: values.name, type });
        invalidate();
        onCreated(category.id);
      } catch (cause) {
        reportError("Category save failed", cause);
        setError("Could not save the category. Please try again.");
      } finally {
        busy.current = false;
      }
    })();
  return (
    <View style={{ gap: 12 }}>
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Input
            label="New category name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            editable={!form.formState.isSubmitting}
          />
        )}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {error}
        </Text>
      ) : null}
      <Button
        disabled={form.formState.isSubmitting}
        title="Create category"
        onPress={() => void submit()}
      />
      <Button
        secondary
        disabled={form.formState.isSubmitting}
        title="Cancel"
        onPress={onCancel}
      />
    </View>
  );
}
