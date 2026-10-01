import { useMemo, type ReactNode } from "react";
import { SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, EmptyState } from "../ui";
import { QueryState } from "../ui/QueryState";
import { TransactionRow } from "./TransactionRow";
import { useTheme } from "../../hooks/useTheme";
import { useTransactionHistory } from "../../hooks/useTransactionHistory";
import { displayCalendarDate } from "../../utils/dates";
import type { TransactionView } from "../../database/repositories/financeReadRepository";
export function TransactionHistoryList({
  history,
  header,
  emptyTitle = "No matching transactions",
  emptyDescription = "Try another filter or date range.",
}: {
  history: ReturnType<typeof useTransactionHistory>;
  header: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const colors = useTheme();
  const sections = useMemo(() => {
    const groups = new Map<string, TransactionView[]>();
    for (const row of history.records) {
      const group = groups.get(row.transaction_date) ?? [];
      group.push(row);
      groups.set(row.transaction_date, group);
    }
    return [...groups].map(([date, data]) => ({ date, data }));
  }, [history.records]);
  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 24, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 24 }}>
            {header}
            <QueryState
              loading={history.loading}
              error={history.error}
              retry={history.refresh}
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={{
              color: colors.muted,
              fontSize: 17,
              fontWeight: "600",
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            {displayCalendarDate(section.date)}
          </Text>
        )}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        ListEmptyComponent={
          !history.loading && !history.error ? (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          ) : null
        }
        ListFooterComponent={
          history.hasMore ? (
            <View style={{ marginTop: 24 }}>
              <Button
                secondary
                disabled={history.loading}
                title={history.loading ? "Loading…" : "Load more"}
                onPress={history.loadMore}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
