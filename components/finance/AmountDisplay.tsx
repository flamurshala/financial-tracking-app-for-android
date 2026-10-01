import { Text } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { formatAmount } from "../../utils/currency";
export function AmountDisplay({ minorUnits }: { minorUnits: number }) {
  const colors = useTheme();
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: 36,
        fontWeight: "700",
        fontVariant: ["tabular-nums"],
      }}
    >
      {formatAmount(minorUnits)}
    </Text>
  );
}
