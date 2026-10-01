import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { subDays } from "date-fns";
import {
  calendarDateToPicker,
  displayCalendarDate,
  localCalendarDate,
} from "../../utils/dates";
import { Button } from "../ui";
import { Chip } from "../ui/Choice";
import { useTheme } from "../../hooks/useTheme";
export function DateField({
  value,
  onChange,
  error,
  disabled = false,
  label = "Date",
  shortcuts = true,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
  shortcuts?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const colors = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text }}>{label}</Text>
      {shortcuts ? (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Chip
            disabled={disabled}
            label="Today"
            selected={value === localCalendarDate()}
            onPress={() => onChange(localCalendarDate())}
          />
          <Chip
            disabled={disabled}
            label="Yesterday"
            selected={value === localCalendarDate(subDays(new Date(), 1))}
            onPress={() => onChange(localCalendarDate(subDays(new Date(), 1)))}
          />
        </View>
      ) : null}
      <Button
        secondary
        disabled={disabled}
        title={displayCalendarDate(value)}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <>
          <DateTimePicker
            value={calendarDateToPicker(value)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onValueChange={(_event, date) => {
              if (Platform.OS !== "ios") setOpen(false);
              onChange(localCalendarDate(date));
            }}
            onDismiss={() => setOpen(false)}
          />
          {Platform.OS === "ios" ? (
            <Button title="Done" onPress={() => setOpen(false)} />
          ) : null}
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
