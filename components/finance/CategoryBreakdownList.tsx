import { expenseChartColors } from "../../constants/charts";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { CategoryBreakdown, DateRange } from "../../types/statistics";
import type { TransactionType } from "../../types/finance";
import { formatAmount } from "../../utils/currency";
import { useTheme } from "../../hooks/useTheme";
export function CategoryBreakdownList({
  rows,
  range,
  type,
  accountId,
}: {
  rows: CategoryBreakdown[];
  range: DateRange;
  type: TransactionType;
  accountId?: string;
}) {
  const colors = useTheme();
  return (
    <View style={{ gap: 16 }}>
      {rows.map((row, index) => (
        <Pressable
          key={row.categoryId}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/category/[id]",
              params: {
                id: row.categoryId,
                fromDate: range.fromDate,
                toDate: range.toDate,
                type,
                ...(accountId ? { accountId } : {}),
              },
            })
          }
          style={{ gap: 6, minHeight: 48 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
            >
              {type === "expense" ? (
                <Text
                  style={{
                    color: expenseChartColors(colors.primary)[index % 6],
                  }}
                >
                  ●{" "}
                </Text>
              ) : null}
              {row.name}
            </Text>
            <Text
              style={{
                color: colors.text,
                fontVariant: ["tabular-nums"],
                fontSize: 17,
              }}
            >
              {formatAmount(row.cents)}
            </Text>
          </View>
          <Text style={{ color: colors.muted }}>
            {row.percentage.toFixed(1)}% · {row.count}{" "}
            {row.count === 1 ? "transaction" : "transactions"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
