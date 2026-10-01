import { useCallback, useMemo, useState } from "react";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Screen, Card, Body, Button, EmptyState } from "../../components/ui";
import { ChoicePicker } from "../../components/ui/Choice";
import { QueryState } from "../../components/ui/QueryState";
import { PeriodSummary } from "../../components/finance/PeriodSummary";
import { PeriodSelector } from "../../components/finance/PeriodSelector";
import { ExpenseChart } from "../../components/finance/ExpenseChart";
import { CategoryBreakdownList } from "../../components/finance/CategoryBreakdownList";
import { useLocalQuery } from "../../hooks/useLocalQuery";
import { getAccounts } from "../../database/repositories/accountRepository";
import { monthName } from "../../database/repositories/statisticsRepository";
import { getStatisticsReport } from "../../services/statistics";
import { localCalendarDate, displayCalendarDate } from "../../utils/dates";
import { getPeriodRange } from "../../utils/periods";
import { formatAmount } from "../../utils/currency";
import type { StatisticsPeriod } from "../../types/statistics";
export default function Statistics() {
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<StatisticsPeriod>("month");
  const [anchor, setAnchor] = useState(localCalendarDate);
  const [custom, setCustom] = useState(() =>
    getPeriodRange("month", localCalendarDate()),
  );
  const [accountId, setAccountId] = useState("");
  const range = useMemo(
    () => (period === "custom" ? custom : getPeriodRange(period, anchor)),
    [period, anchor, custom],
  );
  const invalid = range.fromDate > range.toDate;
  const accounts = useLocalQuery(
    useCallback(() => getAccounts(db, true), [db]),
  );
  const query = useLocalQuery(
    useCallback(
      () =>
        invalid
          ? Promise.resolve(null)
          : getStatisticsReport(
              db,
              period,
              anchor,
              range,
              accountId ? { accountId } : {},
            ),
      [db, period, anchor, range, accountId, invalid],
    ),
  );
  const report = query.data;
  return (
    <Screen>
      <PeriodSelector
        period={period}
        anchor={anchor}
        custom={custom}
        onPeriod={(value) => {
          if (value === "custom") setCustom(range);
          setPeriod(value);
        }}
        onAnchor={setAnchor}
        onCustom={setCustom}
      />
      <ChoicePicker
        label="Report account"
        value={accountId}
        onChange={setAccountId}
        options={[
          { value: "", label: "All accounts" },
          ...(accounts.data?.map((a) => ({
            value: a.id,
            label: a.name + (a.is_archived ? " (archived)" : ""),
          })) ?? []),
        ]}
      />
      <QueryState
        loading={accounts.loading}
        error={accounts.error}
        retry={accounts.refresh}
      />
      {invalid ? (
        <Body>End date must be on or after start date.</Body>
      ) : (
        <QueryState
          loading={query.loading}
          error={query.error}
          retry={query.refresh}
        />
      )}
      {!invalid && !query.loading && !query.error && report ? (
        <>
          <PeriodSummary title="Period summary" totals={report.summary} />
          <Body>
            {report.summary.transactionCount} transactions · {report.days}{" "}
            calendar days. Balance adjustments are excluded.
          </Body>
          <Body>Expenses by category</Body>
          {report.expenses.length ? (
            <>
              <Card>
                <ExpenseChart
                  data={report.expenses.map((row) => ({
                    label: row.name,
                    cents: row.cents,
                  }))}
                />
              </Card>
              <Card>
                <CategoryBreakdownList
                  rows={report.expenses}
                  range={range}
                  type="expense"
                  accountId={accountId}
                />
              </Card>
            </>
          ) : (
            <EmptyState
              title="No expenses"
              description="Expenses in this period will appear here."
            />
          )}
          <Body>Income by category</Body>
          {report.income.length ? (
            <Card>
              <CategoryBreakdownList
                rows={report.income}
                range={range}
                type="income"
                accountId={accountId}
              />
            </Card>
          ) : (
            <EmptyState
              title="No income"
              description="Income in this period will appear here."
            />
          )}
          <Card>
            <Body>Insights</Body>
            <Body>
              {report.summary.expenseCount} expenses ·{" "}
              {report.summary.incomeCount} income entries
            </Body>
            <Body>
              Average daily expenses: {formatAmount(report.averageDailyCents)}
            </Body>
            {report.expenses[0] ? (
              <Body>
                Top spending category: {report.expenses[0].name} ·{" "}
                {formatAmount(report.expenses[0].cents)}
              </Body>
            ) : null}
            {report.mostUsed ? (
              <Body>
                Most frequent category: {report.mostUsed.name} ·{" "}
                {report.mostUsed.count} transactions
              </Body>
            ) : null}
            {report.largestExpense ? (
              <Button
                secondary
                title={`Largest expense: ${formatAmount(report.largestExpense.amount_cents)}`}
                onPress={() =>
                  router.push(`/transaction/${report.largestExpense!.id}`)
                }
              />
            ) : null}
            {period === "day" && report.largestIncome ? (
              <Button
                secondary
                title={`Largest income: ${formatAmount(report.largestIncome.amount_cents)}`}
                onPress={() =>
                  router.push(`/transaction/${report.largestIncome!.id}`)
                }
              />
            ) : null}
            {period === "week" &&
            report.summary.expenses > 0 &&
            report.highestDay &&
            report.lowestDay ? (
              <>
                <Body>
                  Highest spending day:{" "}
                  {displayCalendarDate(report.highestDay.date)} ·{" "}
                  {formatAmount(report.highestDay.expenses)}
                </Body>
                <Body>
                  Lowest spending day:{" "}
                  {displayCalendarDate(report.lowestDay.date)} ·{" "}
                  {formatAmount(report.lowestDay.expenses)}
                </Body>
              </>
            ) : null}
            {period === "year" ? (
              <>
                <Body>
                  Average monthly expenses:{" "}
                  {formatAmount(report.averageMonthlyCents)}
                </Body>
                {report.summary.expenses > 0 && report.highestMonth ? (
                  <Body>
                    Highest spending month:{" "}
                    {monthName(report.highestMonth.month)} ·{" "}
                    {formatAmount(report.highestMonth.expenses)}
                  </Body>
                ) : null}
              </>
            ) : null}
          </Card>
          {report.comparison ? (
            <Card>
              <Body>
                Previous month expenses:{" "}
                {formatAmount(report.comparison.previousExpenses)}
              </Body>
              <Body>
                Change: {report.comparison.difference > 0 ? "+" : ""}
                {formatAmount(report.comparison.difference)}
              </Body>
              <Body>
                {report.comparison.percentageChange === null
                  ? "No expenses in the previous month; percentage change is unavailable."
                  : report.comparison.percentageChange === 0
                    ? "Spending unchanged"
                    : `${Math.abs(report.comparison.percentageChange).toFixed(1)}% ${report.comparison.percentageChange > 0 ? "higher" : "lower"}`}
              </Body>
            </Card>
          ) : null}
          {period === "year" ? (
            <Card>
              <Body>Monthly expenses</Body>
              <ExpenseChart
                monthly
                data={report.monthly.map((row) => ({
                  label: monthName(row.month),
                  cents: row.expenses,
                }))}
              />
              {report.monthly.map((row) => (
                <Body key={row.month}>
                  {monthName(row.month)} · {formatAmount(row.expenses)}
                </Body>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
