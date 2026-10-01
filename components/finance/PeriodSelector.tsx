import { Text, View } from "react-native";
import { Chip } from "../ui/Choice";
import { Button } from "../ui";
import { DateField } from "./DateField";
import type { DateRange, StatisticsPeriod } from "../../types/statistics";
import { getPeriodRange, movePeriod, periodLabel } from "../../utils/periods";
import { useTheme } from "../../hooks/useTheme";
export function PeriodSelector({
  period,
  anchor,
  custom,
  onPeriod,
  onAnchor,
  onCustom,
}: {
  period: StatisticsPeriod;
  anchor: string;
  custom: DateRange;
  onPeriod: (period: StatisticsPeriod) => void;
  onAnchor: (date: string) => void;
  onCustom: (range: DateRange) => void;
}) {
  const colors = useTheme();
  const range = period === "custom" ? custom : getPeriodRange(period, anchor);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["day", "week", "month", "year", "custom"] as const).map((value) => (
          <Chip
            key={value}
            label={value.charAt(0).toUpperCase() + value.slice(1)}
            selected={period === value}
            onPress={() => onPeriod(value)}
          />
        ))}
      </View>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}
      >
        {periodLabel(period, anchor, range)}
      </Text>
      {period === "custom" ? (
        <>
          <DateField
            label="Start Date"
            shortcuts={false}
            value={custom.fromDate}
            onChange={(fromDate) => onCustom({ ...custom, fromDate })}
          />
          <DateField
            label="End Date"
            shortcuts={false}
            value={custom.toDate}
            onChange={(toDate) => onCustom({ ...custom, toDate })}
          />
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              secondary
              title="Previous"
              onPress={() => onAnchor(movePeriod(period, anchor, -1))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              secondary
              title="Next"
              onPress={() => onAnchor(movePeriod(period, anchor, 1))}
            />
          </View>
        </View>
      )}
    </View>
  );
}
