import { useCallback, useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Card, Body } from "../../components/ui";
import { QueryState } from "../../components/ui/QueryState";
import { TransactionHistoryList } from "../../components/finance/TransactionHistoryList";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { useTransactionHistory } from "../../hooks/useTransactionHistory";
import { getCategoryById } from "../../database/repositories/categoryRepository";
import {
  getPeriodSummary,
  roundedAverageCents,
} from "../../database/repositories/statisticsRepository";
import { formatAmount } from "../../utils/currency";
import { localCalendarDate, displayCalendarDate } from "../../utils/dates";
import { getPeriodRange } from "../../utils/periods";
import type { TransactionFilters } from "../../types/statistics";
export default function CategoryReport() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    id: string;
    fromDate: string;
    toDate: string;
    type: string;
    accountId: string;
  }>();
  const range = useMemo(
    () => ({
      fromDate:
        params.fromDate ??
        getPeriodRange("month", localCalendarDate()).fromDate,
      toDate:
        params.toDate ?? getPeriodRange("month", localCalendarDate()).toDate,
    }),
    [params.fromDate, params.toDate],
  );
  const type = params.type === "income" ? "income" : "expense";
  const filters = useMemo<TransactionFilters>(
    () => ({
      ...range,
      categoryId: params.id,
      type,
      accountId: params.accountId || undefined,
      excludeAdjustments: true,
    }),
    [range, params.id, type, params.accountId],
  );
  const query = useLocalQuery(
    useCallback(
      async () => ({
        category: await getCategoryById(db, params.id),
        summary: await getPeriodSummary(db, range, filters),
      }),
      [db, params.id, range, filters],
    ),
  );
  const history = useTransactionHistory("", filters);
  const total =
    type === "income"
      ? query.data?.summary.income
      : query.data?.summary.expenses;
  const count = query.data?.summary.transactionCount ?? 0;
  return (
    <TransactionHistoryList
      history={history}
      header={
        <>
          <QueryState
            loading={query.loading}
            error={query.error}
            retry={query.refresh}
          />
          {query.data ? (
            <>
              <Body>
                {query.data.category?.name ?? "Category"} · {type}
              </Body>
              <Body>
                {displayCalendarDate(range.fromDate)} –{" "}
                {displayCalendarDate(range.toDate)}
              </Body>
              <Card>
                <Body>Total: {formatAmount(total ?? 0)}</Body>
                <Body>{count} transactions</Body>
                <Body>
                  Average:{" "}
                  {formatAmount(roundedAverageCents(total ?? 0, count))}
                </Body>
              </Card>
            </>
          ) : null}
        </>
      }
    />
  );
}
