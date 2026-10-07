import { useSettingsStore } from "../../store/settingsStore";
import { saveHideBalances } from "../../services/preferences";
import { Alert } from "react-native";
import { useCallback } from "react";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Screen,
  SectionTitle,
  Body,
  Card,
  Button,
  EmptyState,
} from "../../components/ui";
import { localCalendarDate, displayCalendarDate } from "../../utils/dates";
import { formatAmount } from "../../utils/currency";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { getDashboard } from "../../services/finance";
import { QueryState } from "../../components/ui/QueryState";
import { Notice } from "../../components/ui/Notice";
import { PeriodSummary } from "../../components/finance/PeriodSummary";
import { TransactionRow } from "../../components/finance/TransactionRow";
export default function Home() {
  const db = useSQLiteContext();
  const hidden = useSettingsStore((state) => state.hideBalances);
  const query = useLocalQuery(useCallback(() => getDashboard(db), [db]));
  return (
    <Screen>
      <Notice />
      <Body>{displayCalendarDate(localCalendarDate())}</Body>
      <Button
        title="+ Add Transaction"
        onPress={() => router.push("/transaction/add")}
      />
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.refresh}
      />
      {query.data ? (
        <>
          <Card>
            <Body>Current Total Balance</Body>
            <Button
              secondary
              title={hidden ? "Show balances" : "Hide balances"}
              onPress={() => {
                void saveHideBalances(db, !hidden).catch(() =>
                  Alert.alert("Balances", "Unable to save display preference."),
                );
              }}
            />
            <SectionTitle>
              {hidden ? "••••" : formatAmount(query.data.balance)}
            </SectionTitle>
            {query.data.accounts.map((account) => (
              <Body key={account.id}>
                {account.name}
                {account.is_archived ? " (archived)" : ""} ·{" "}
                {hidden ? "••••" : formatAmount(account.balance_cents)}
              </Body>
            ))}
          </Card>
          {!query.data.accounts.length ? (
            <>
              <EmptyState
                title="No accounts yet"
                description="Create an account to start tracking your money."
              />
              <Button
                title="Create account"
                onPress={() => router.push("/account/add")}
              />
            </>
          ) : null}
          <PeriodSummary
            hidden={hidden}
            title="Today"
            totals={query.data.today}
            today
          />
          <PeriodSummary
            hidden={hidden}
            title="This Month"
            totals={query.data.month}
          />
          <SectionTitle>Recent transactions</SectionTitle>
          {query.data.recent.length ? (
            <Card>
              {query.data.recent.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  hidden={hidden}
                />
              ))}
              <Button
                secondary
                title="View all transactions"
                onPress={() => router.push("/(tabs)/transactions")}
              />
            </Card>
          ) : (
            <EmptyState
              title="No transactions yet"
              description="Add your first expense or income."
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}
