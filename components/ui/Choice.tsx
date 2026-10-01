import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../hooks/useTheme";
import { Button } from "./index";
export interface ChoiceOption {
  value: string;
  label: string;
}
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: selected ? colors.onPrimary : colors.text,
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function ChoicePicker({
  label,
  value,
  options,
  onChange,
  error,
  disabled = false,
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const colors = useTheme();
  const selected = options.find((option) => option.value === value);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text }}>{label}</Text>
      <Button
        secondary
        disabled={disabled}
        title={selected?.label ?? `Choose ${label.toLowerCase()}`}
        onPress={() => setOpen(true)}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {error}
        </Text>
      ) : null}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24, gap: 12 }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontSize: 24, fontWeight: "700", color: colors.text }}
            >
              {label}
            </Text>
            {options.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={option.value === value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              />
            ))}
            <Button secondary title="Cancel" onPress={() => setOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
