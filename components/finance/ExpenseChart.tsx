import { View, useWindowDimensions } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { expenseChartColors } from "../../constants/charts";
import { useTheme } from "../../hooks/useTheme";
/** Ratios are presentation values only. Exact monetary amounts remain in the adjacent list. */
export function ExpenseChart({
  data,
  monthly = false,
}: {
  data: { label: string; cents: number }[];
  monthly?: boolean;
}) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const max = Math.max(...data.map((row) => row.cents), 0);
  if (!max || !data.length) return null;
  const chartData = data.map((row) => ({
    value: (row.cents / max) * 100,
    label: row.label,
  }));
  if (monthly)
    return (
      <BarChart
        data={chartData}
        width={Math.max(120, width - 112)}
        height={180}
        maxValue={100}
        noOfSections={4}
        barWidth={18}
        spacing={12}
        initialSpacing={8}
        frontColor={colors.primary}
        hideRules
        hideYAxisText
        xAxisLabelTextStyle={{ color: colors.text, fontSize: 12 }}
        xAxisThickness={0}
        yAxisThickness={0}
        disablePress
        hideOrigin
        yAxisLabelWidth={0}
        nestedScrollEnabled
        showScrollIndicator
      />
    );
  const palette = expenseChartColors(colors.primary);
  return (
    <View style={{ alignItems: "center" }}>
      <PieChart
        donut
        radius={Math.max(60, Math.min((width - 120) / 2, 110))}
        innerRadius={Math.max(36, Math.min((width - 120) / 3, 70))}
        innerCircleColor={colors.surface}
        strokeWidth={2}
        strokeColor={colors.surface}
        data={chartData.map((row, index) => ({
          ...row,
          color: palette[index % palette.length],
        }))}
      />
    </View>
  );
}
