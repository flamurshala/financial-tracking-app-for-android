import { useExportStore } from "../../store/exportStore";
import { useState } from "react";
import { router } from "expo-router";
import { Button, Input } from "../../components/ui";
import { Notice } from "../../components/ui/Notice";
import { TransactionHistoryList } from "../../components/finance/TransactionHistoryList";
import { TransactionFilterPanel } from "../../components/finance/TransactionFilterPanel";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTransactionHistory } from "../../hooks/useTransactionHistory";
import type { TransactionFilters } from "../../types/statistics";
export default function Transactions() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TransactionFilters>({});
  const debounced = useDebouncedValue(search);
  const history = useTransactionHistory(debounced, filters);
  return (
    <TransactionHistoryList
      history={history}
      emptyTitle={
        debounced.trim() || Object.keys(filters).length
          ? "No matching transactions"
          : "No transactions yet"
      }
      emptyDescription="Add a transaction or change the search and filters."
      header={
        <>
          <Notice />
          <Button
            title="+ Add Transaction"
            onPress={() => router.push("/transaction/add")}
          />
          <Input
            label="Search descriptions"
            placeholder="naft, elona, spotify…"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            maxLength={500}
            returnKeyType="search"
          />
          <TransactionFilterPanel filters={filters} onApply={setFilters} />
          <Button
            title="Export matching transactions"
            secondary
            onPress={() => {
              useExportStore.getState().setFilters({ ...filters, search });
              router.push("/export");
            }}
          />
          {search ? (
            <Button
              secondary
              title="Clear search and all filters"
              onPress={() => {
                setSearch("");
                setFilters({});
              }}
            />
          ) : null}
        </>
      }
    />
  );
}
