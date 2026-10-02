import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Screen,
  Card,
  Body,
  SectionTitle,
  Button,
  EmptyState,
} from "../../components/ui";
import { QueryState } from "../../components/ui/QueryState";
import { Notice } from "../../components/ui/Notice";
import { AccountForm } from "../../components/finance/AccountForm";
import {
  archiveAccount,
  restoreAccount,
  getAccounts,
  getAccountById,
  getAccountBalance,
} from "../../database/repositories/accountRepository";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { useIsMounted } from "../../hooks/useIsMounted";
import { useFinanceStore } from "../../store/financeStore";
import { formatAmount } from "../../utils/currency";
import { reportError } from "../../utils/errors";
export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const isMounted = useIsMounted();
  const invalidate = useFinanceStore((state) => state.invalidate);
  const loader = useCallback(async () => {
    const account = await getAccountById(db, id);
    return account
      ? {
          account,
          balance: await getAccountBalance(db, id),
          activeCount: (await getAccounts(db)).length,
        }
      : null;
  }, [db, id]);
  const query = useLocalQuery(loader);
  const archive = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      if (query.data?.account.is_archived) await restoreAccount(db, id);
      else await archiveAccount(db, id);
      invalidate(
        query.data?.account.is_archived
          ? "Account restored"
          : "Account archived",
      );
      if (!isMounted()) return;
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/accounts");
    } catch (cause) {
      reportError("Account archive failed", cause);
      Alert.alert("Could not archive", "Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  if (!query.data)
    return (
      <Screen>
        <QueryState
          loading={query.loading}
          error={query.error}
          retry={query.refresh}
        />
        {!query.loading && !query.error ? (
          <EmptyState
            title="Account not found"
            description="This account is no longer available."
          />
        ) : null}
      </Screen>
    );
  const { account, balance } = query.data;
  return (
    <Screen>
      <Notice />
      <QueryState loading={false} error={query.error} retry={query.refresh} />
      {editing ? (
        <AccountForm
          initial={account}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <SectionTitle>{account.name}</SectionTitle>
          <Card>
            <Body>Current balance</Body>
            <SectionTitle>{formatAmount(balance)}</SectionTitle>
            <Body>
              Initial balance: {formatAmount(account.initial_balance_cents)}
            </Body>
            <Body>
              {account.type.charAt(0).toUpperCase() + account.type.slice(1)} ·{" "}
              {account.currency}
              {account.is_archived ? " · Archived" : ""}
            </Body>
          </Card>
          <Button
            title="Edit account"
            disabled={pending || query.loading}
            onPress={() => setEditing(true)}
          />
          {!account.is_archived ? (
            <>
              <Button
                title="Adjust Balance"
                disabled={pending || query.loading}
                onPress={() =>
                  router.push({
                    pathname: "/account/adjust/[id]",
                    params: { id },
                  })
                }
              />
              <Button
                secondary
                title="Archive account"
                disabled={pending || query.loading}
                onPress={() =>
                  Alert.alert(
                    "Archive account?",
                    query.data?.activeCount === 1
                      ? "This is your last active account. Archiving it stops new transaction entry until you create or restore an account. Its balance and history remain intact. Continue?"
                      : "This account will be hidden from new-entry choices. Its balance remains in your total, and its transaction history is retained.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Archive", onPress: () => void archive() },
                    ],
                  )
                }
              />
            </>
          ) : (
            <>
              <Button
                title="Restore account"
                disabled={pending}
                onPress={() => void archive()}
              />
              <Body>
                Archived accounts retain their balance and history. New
                transactions and balance adjustments cannot use this account.
              </Body>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
