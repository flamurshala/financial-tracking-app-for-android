import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { endOfMonth, startOfMonth, endOfYear, startOfYear } from "date-fns";
import {
  Screen,
  SectionTitle,
  Card,
  Body,
  Button,
  Input,
} from "../components/ui";
import { ChoicePicker } from "../components/ui/Choice";
import { useExportStore } from "../store/exportStore";
import { localCalendarDate, calendarDateSchema } from "../utils/dates";
import { shareFinanceExport } from "../services/exports";
import type { TransactionFilters } from "../types/statistics";
export default function ExportScreen() {
  const db = useSQLiteContext();
  const filtered = useExportStore((state) => state.filters);
  const [scope, setScope] = useState(filtered ? "filtered" : "all");
  const [from, setFrom] = useState(localCalendarDate(startOfMonth(new Date())));
  const [to, setTo] = useState(localCalendarDate());
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = async (kind: "csv" | "json") => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setCount(0);
    try {
      const now = new Date();
      let filters: TransactionFilters = {};
      if (scope === "filtered") filters = { ...filtered };
      if (scope === "custom") {
        if (
          !calendarDateSchema.safeParse(from).success ||
          !calendarDateSchema.safeParse(to).success ||
          from > to
        )
          throw new Error(
            "Enter valid YYYY-MM-DD dates, with the start on or before the end.",
          );
        filters = { fromDate: from, toDate: to };
      }
      if (scope === "month")
        filters = {
          fromDate: localCalendarDate(startOfMonth(now)),
          toDate: localCalendarDate(endOfMonth(now)),
        };
      if (scope === "year")
        filters = {
          fromDate: localCalendarDate(startOfYear(now)),
          toDate: localCalendarDate(endOfYear(now)),
        };
      await shareFinanceExport(
        db,
        kind,
        filters,
        kind === "json"
          ? "backup"
          : `${scope}_${filters.fromDate ?? "all"}_${filters.toDate ?? ""}`,
        (value) => {
          if (mounted.current) setCount(value);
        },
        () => !mounted.current,
      );
    } catch (error) {
      if (mounted.current)
        Alert.alert(
          "Export",
          error instanceof Error
            ? error.message
            : "Unable to export. Please retry.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Screen>
      <SectionTitle>Export Data</SectionTitle>
      <Card>
        <Body>
          Exports contain personal financial information. Choose a trusted
          destination in the sharing sheet. Files remain in private temporary
          cache until Android clears it or a later export removes files older
          than one day.
        </Body>
        <ChoicePicker
          label="CSV period"
          value={scope}
          disabled={busy}
          onChange={setScope}
          options={[
            { value: "all", label: "All transactions" },
            { value: "month", label: "This month" },
            { value: "year", label: "This year" },
            { value: "custom", label: "Custom dates" },
            ...(filtered
              ? [
                  {
                    value: "filtered",
                    label: "Filters from transaction history",
                  },
                ]
              : []),
          ]}
        />
        {scope === "custom" ? (
          <>
            <Input
              label="From (YYYY-MM-DD)"
              value={from}
              onChangeText={setFrom}
              editable={!busy}
            />
            <Input
              label="To (YYYY-MM-DD)"
              value={to}
              onChangeText={setTo}
              editable={!busy}
            />
          </>
        ) : null}
        <Body>
          CSV includes all matching rows, account/category names and balance
          adjustments. Deleted transactions are excluded. Amounts use decimal
          euros. Text cells that could be spreadsheet formulas receive an
          apostrophe prefix.
        </Body>
        <Button
          title={
            busy
              ? `Preparing export (${count} CSV rows)…`
              : "Export and share CSV"
          }
          disabled={busy}
          onPress={() => {
            void run("csv");
          }}
        />
      </Card>
      <Card>
        <Body>
          JSON backup contains all local finance records, including archives and
          deletion markers, and non-secret display/reminder preferences. It
          excludes cloud credentials and App Lock settings. Import is not
          supported.
        </Body>
        <Button
          title="Export JSON backup"
          disabled={busy}
          onPress={() =>
            Alert.alert(
              "Share local backup?",
              "This includes all local financial records, regardless of CSV filters.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Export",
                  onPress: () => {
                    void run("json");
                  },
                },
              ],
            )
          }
        />
      </Card>
    </Screen>
  );
}
