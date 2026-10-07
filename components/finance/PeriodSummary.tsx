import { Text, View } from "react-native";
import { Body, Card } from "../ui";
import { formatAmount } from "../../utils/currency";
import { useTheme } from "../../hooks/useTheme";
export function PeriodSummary({
  title,
  totals,
  today = false,
  hidden = false,
}: {
  title: string;
  totals: { income: number; expenses: number; net: number };
  today?: boolean;
  hidden?: boolean;
}) {
  const colors = useTheme();
  return (
    <Card>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}
      >
        {title}
      </Text>
      {[
        { label: today ? "Spent" : "Expenses", amount: totals.expenses },
        { label: "Income", amount: totals.income },
        { label: "Net", amount: totals.net },
      ].map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Body>{row.label}</Body>
          <Text
            style={{
              color: colors.text,
              fontSize: today && row.label === "Spent" ? 22 : 17,
              fontWeight: today && row.label === "Spent" ? "700" : "400",
              fontVariant: ["tabular-nums"],
            }}
          >
            {hidden ? "••••" : formatAmount(row.amount)}
          </Text>
        </View>
      ))}
    </Card>
  );
}
