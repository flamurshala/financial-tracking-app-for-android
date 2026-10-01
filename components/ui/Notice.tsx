import { useEffect } from "react";
import { Text } from "react-native";
import { useFinanceStore } from "../../store/financeStore";
import { useTheme } from "../../hooks/useTheme";
export function Notice() {
  const notice = useFinanceStore((state) => state.notice);
  const clear = useFinanceStore((state) => state.clearNotice);
  const colors = useTheme();
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(clear, 4000);
      return () => clearTimeout(timer);
    }
  }, [notice, clear]);
  return notice ? (
    <Text
      accessibilityLiveRegion="polite"
      style={{ color: colors.primary, fontSize: 16 }}
    >
      {notice}
    </Text>
  ) : null;
}
