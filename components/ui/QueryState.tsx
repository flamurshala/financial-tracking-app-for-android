import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "./index";
import { useTheme } from "../../hooks/useTheme";
export function QueryState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  const colors = useTheme();
  if (error)
    return (
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {error}
        </Text>
        <Button title="Try again" onPress={retry} />
      </View>
    );
  return loading ? (
    <ActivityIndicator
      color={colors.primary}
      accessibilityLabel="Loading local records"
    />
  ) : null;
}
