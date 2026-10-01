import { useColorScheme } from "react-native";
import { palettes } from "../constants/theme";
import { useSettingsStore } from "../store/settingsStore";
export function useTheme() {
  const system = useColorScheme();
  const preference = useSettingsStore((state) => state.theme);
  return palettes[
    preference === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : preference
  ];
}
