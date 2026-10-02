import { useCallback, useState } from "react";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Screen,
  EmptyState,
  Card,
  SectionTitle,
  Body,
  Button,
} from "../../components/ui";
import { QueryState } from "../../components/ui/QueryState";
import { Notice } from "../../components/ui/Notice";
import { getAccountBalances } from "../../database/repositories/financeReadRepository";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { formatAmount } from "../../utils/currency";
export default function Accounts() {
  const db = useSQLiteContext();
  const [showArchived, setShowArchived] = useState(false);
  const query = useLocalQuery(useCallback(() => getAccountBalances(db), [db]));
  const active = query.data?.filter((account) => !account.is_archived) ?? [];
  const archived = query.data?.filter((account) => account.is_archived) ?? [];
  return (
    <Screen>
      <Notice />
      <Button
        title="+ Create Account"
        onPress={() => router.push("/account/add")}
      />
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.refresh}
      />
      {query.data && !active.length ? (
        <EmptyState
          title={archived.length ? "No active accounts" : "No accounts yet"}
          description="Create an account to start tracking your money."
        />
      ) : null}
      {[...active, ...(showArchived ? archived : [])].map((account) => (
        <Card key={account.id}>
          <SectionTitle>
            {account.name}
            {account.is_archived ? " · Archived" : ""}
          </SectionTitle>
          <SectionTitle>{formatAmount(account.balance_cents)}</SectionTitle>
          <Body>Type: {account.type}</Body>
          <Body>
            Initial: {formatAmount(account.initial_balance_cents)} ·{" "}
            {account.currency}
          </Body>
          <Button
            secondary
            title="View account"
            onPress={() =>
              router.push({
                pathname: "/account/[id]",
                params: { id: account.id },
              })
            }
          />
        </Card>
      ))}
      {archived.length ? (
        <Button
          secondary
          title={`${showArchived ? "Hide" : "Show"} archived accounts (${archived.length})`}
          onPress={() => setShowArchived(!showArchived)}
        />
      ) : null}
    </Screen>
  );
}
