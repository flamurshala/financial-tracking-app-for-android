import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { TransactionView } from "../../database/repositories/financeReadRepository";
import { formatAmount } from "../../utils/currency";
import { useTheme } from "../../hooks/useTheme";
export function TransactionRow({
  transaction,
  hidden = false,
}: {
  transaction: TransactionView;
  hidden?: boolean;
}) {
  const colors = useTheme();
  const category = transaction.is_balance_adjustment
    ? "Balance Adjustment"
    : transaction.category_name;
  const secondary = [
    category?.toLocaleLowerCase() ===
    transaction.description.toLocaleLowerCase()
      ? null
      : category,
    transaction.account_name,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.description}, ${transaction.type}, ${hidden ? "amount hidden" : formatAmount(transaction.amount_cents)}`}
      onPress={() =>
        router.push({
          pathname: "/transaction/[id]",
          params: { id: transaction.id },
        })
      }
      style={{
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          {transaction.description}
        </Text>
        <Text
          style={{
            color: transaction.type === "income" ? colors.primary : colors.text,
            fontSize: 17,
            fontWeight: "600",
            fontVariant: ["tabular-nums"],
            flexShrink: 1,
          }}
        >
          {transaction.type === "income" ? "+" : "−"}
          {hidden ? "••••" : formatAmount(transaction.amount_cents)}
        </Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{secondary}</Text>
    </Pressable>
  );
}
