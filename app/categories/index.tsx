import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { Screen, Body, Button, Card, SectionTitle } from "../../components/ui";
import { QueryState } from "../../components/ui/QueryState";
import { CategoryManagerForm } from "../../components/finance/CategoryManagerForm";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { useFinanceStore } from "../../store/financeStore";
import {
  archiveCategory,
  restoreCategory,
  getCategories,
} from "../../database/repositories/categoryRepository";
import type { Category } from "../../types/finance";
import { protectedCategoryIds } from "../../constants/categoryProtection";
export default function Categories() {
  const db = useSQLiteContext();
  const query = useLocalQuery(
    useCallback(() => getCategories(db, { includeArchived: true }), [db]),
  );
  const [editing, setEditing] = useState<Category | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const archive = async (category: Category) => {
    if (busy) return;
    setBusy(true);
    try {
      if (category.is_archived) await restoreCategory(db, category.id);
      else await archiveCategory(db, category.id);
      useFinanceStore.getState().invalidate("Category updated");
    } catch (error) {
      Alert.alert(
        "Category",
        error instanceof Error ? error.message : "Could not update category.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Body>
        Built-in names remain fixed. Archiving hides categories from new entries
        and keeps their history and statistics.
      </Body>
      {editing !== undefined ? (
        <CategoryManagerForm
          key={editing?.id ?? "new"}
          category={editing}
          onDone={() => setEditing(undefined)}
        />
      ) : (
        <Button title="+ Add Category" onPress={() => setEditing(null)} />
      )}
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.refresh}
      />
      {(["expense", "income"] as const).map((type) => (
        <View key={type} style={{ gap: 16 }}>
          <SectionTitle>
            {type === "expense" ? "Expense Categories" : "Income Categories"}
          </SectionTitle>
          {query.data
            ?.filter(
              (category) => category.type === type || category.type === "both",
            )
            .map((category) => (
              <Card key={category.id}>
                <Body>
                  {category.name} · {category.type} ·{" "}
                  {category.is_default ? "Built-in" : "Custom"}
                  {category.is_archived ? " · Archived" : ""}
                </Body>
                {!category.is_default ? (
                  <Button
                    secondary
                    title={`Edit ${category.name}`}
                    disabled={busy}
                    onPress={() => setEditing(category)}
                  />
                ) : null}
                {!protectedCategoryIds.has(category.id) ||
                category.is_archived ? (
                  <Button
                    secondary
                    title={`${category.is_archived ? "Restore" : "Archive"} ${category.name}`}
                    disabled={busy}
                    onPress={() => {
                      if (category.is_archived) void archive(category);
                      else
                        Alert.alert(
                          "Archive category?",
                          "Existing transactions remain intact. This category will be hidden from new-entry choices.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Archive",
                              onPress: () => void archive(category),
                            },
                          ],
                        );
                    }}
                  />
                ) : (
                  <Body>Other remains available for transaction entry.</Body>
                )}
              </Card>
            ))}
        </View>
      ))}
    </Screen>
  );
}
