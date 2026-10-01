import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  Screen,
  EmptyState,
  Card,
  Body,
  Button,
  SectionTitle,
} from "../../components/ui";
import { QueryState } from "../../components/ui/QueryState";
import { Notice } from "../../components/ui/Notice";
import { TransactionForm } from "../../components/finance/TransactionForm";
import {
  getTransactionById,
  softDeleteTransaction,
} from "../../database/repositories/transactionRepository";
import { getAccountById } from "../../database/repositories/accountRepository";
import { getCategoryById } from "../../database/repositories/categoryRepository";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { useIsMounted } from "../../hooks/useIsMounted";
import { useFinanceStore } from "../../store/financeStore";
import { displayCalendarDate } from "../../utils/dates";
import { formatAmount } from "../../utils/currency";
import { reportError } from "../../utils/errors";
export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);
  const isMounted = useIsMounted();
  const invalidate = useFinanceStore((state) => state.invalidate);
  const loader = useCallback(async () => {
    const transaction = await getTransactionById(db, id);
    if (!transaction) return null;
    return {
      transaction,
      account: await getAccountById(db, transaction.account_id),
      category: transaction.category_id
        ? await getCategoryById(db, transaction.category_id)
        : null,
    };
  }, [db, id]);
  const query = useLocalQuery(loader);
  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    setDeleting(true);
    try {
      await softDeleteTransaction(db, id);
      invalidate("Transaction deleted");
      if (!isMounted()) return;
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/transactions");
    } catch (cause) {
      reportError("Transaction delete failed", cause);
      Alert.alert("Could not delete", "Please try again.");
    } finally {
      busy.current = false;
      setDeleting(false);
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
            title="Transaction not found"
            description="This record may have been deleted."
          />
        ) : null}
      </Screen>
    );
  const { transaction, account, category } = query.data;
  return (
    <Screen>
      <Notice />
      <QueryState loading={false} error={query.error} retry={query.refresh} />
      {editing ? (
        <>
          <TransactionForm
            initial={transaction}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </>
      ) : (
        <>
          <Card>
            <Body>
              {transaction.is_balance_adjustment
                ? "Balance Adjustment"
                : transaction.type === "income"
                  ? "Income"
                  : "Expense"}
            </Body>
            <SectionTitle>
              {transaction.type === "income" ? "+" : "−"}
              {formatAmount(transaction.amount_cents)}
            </SectionTitle>
            <Body>{transaction.description}</Body>
            <Body>
              {category?.name ?? "Balance Adjustment"} ·{" "}
              {account?.name ?? "Account unavailable"}
            </Body>
            <Body>{displayCalendarDate(transaction.transaction_date)}</Body>
          </Card>
          <Button
            disabled={deleting || query.loading}
            title="Edit"
            onPress={() => setEditing(true)}
          />
          <Button
            secondary
            disabled={deleting || query.loading}
            title={deleting ? "Deleting…" : "Delete"}
            onPress={() =>
              Alert.alert(
                "Delete transaction?",
                "This transaction will no longer affect your balance.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => void remove(),
                  },
                ],
              )
            }
          />
        </>
      )}
    </Screen>
  );
}
