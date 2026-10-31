# Phase 4 · Statistics and combined filters

The existing app now supports Day, Monday–Sunday Week, Month (default), Year and inclusive Custom reports. Previous/Next selects adjacent periods. Accounts can be selected across reports, including archived accounts. Category rows open a paginated detail screen with exact totals, transaction count, rounded average and existing transaction detail/edit navigation.

## Implementation

- `app/(tabs)/statistics.tsx`: period controls, summary, expense/income breakdowns, daily/weekly/monthly/yearly insights, previous-month comparison and January–December expenses.
- `app/category/[id].tsx`: category report and paginated transactions retaining the selected dates, type and account.
- `PeriodSelector`, `ExpenseChart`, `CategoryBreakdownList`, `TransactionFilterPanel`, and shared `TransactionHistoryList` reuse existing controls and theme.
- `statisticsRepository`: `getPeriodSummary`, expense/income breakdowns, `getDailyTotals`, `getMonthlyTotalsForYear`, `getLargestTransaction`, `mostUsedCategory`, `getTransactionsForCategory`, `roundedAverageCents`.
- `services/statistics`: consistent report snapshot and previous-month comparison. Focus and committed-write revision changes invalidate screen snapshots; returning from edit/delete refreshes reports and category history.

## Charts

Added `react-native-gifted-charts` 1.4.79 with Expo-compatible `react-native-svg` and `expo-linear-gradient` peers. Its maintained [official project](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts) supports Expo and both required chart forms. A responsive donut shows category proportions with matching markers beside the exact amounts; one scrolling bar chart shows yearly months using the same library. No animation or monetary calculations depend on chart values. Ratios are presentation-only; empty spending periods do not render a chart. A compact repeating palette is used because categories do not have a persisted color model.

## Filtering and money

Every applied condition is combined with AND in parameterized SQLite: type, category, account, inclusive dates, amount bounds in cents, and escaped literal description tokens. Lists fetch 51 rows to display 50 and determine pagination. Search normalizes NFC/lowercase text into a derived column; migration 4 backfills existing descriptions without changing financial metadata or synchronization status. Insert/edit keeps the column current. The small trailing-vowel name aid preserves; it is not full linguistic stemming. Substring search scans candidate descriptions in SQLite and does not use a B-tree text index or JavaScript transaction scan.

Money remains safe integer cents. SQL uses integer SUM, validates safe results, and rejects overflow; exact BigInt division rounds averages to the nearest cent, half upward. Percentages and chart ratios are presentation only. The Hermes-compatible formatter never passes BigInt to Intl.

Calendar dates stay local `YYYY-MM-DD`. Weeks start Monday. Boundaries are inclusive. Weekly averages divide by seven, monthly averages by the full month's calendar days, yearly monthly averages by twelve. Zero days/months are included. Previous-month zero expenses produce an unavailable percentage rather than NaN/Infinity. Equal or reversed custom endpoints are accepted or rejected respectively.

Deleted records are excluded from normal queries. Balance adjustments remain visible in history and affect balances but are excluded from every report, breakdown, largest-entry statistic and category detail list. No transfers or cloud synchronization were added.

Migration 4 adds one partial compound index: `transactions_type_date_report(type, transaction_date) WHERE deleted_at IS NULL AND is_balance_adjustment = 0`. EXPLAIN QUERY PLAN confirms its use for type/date reporting. Existing active date/account/category indexes already exclude tombstones and cover their respective filters; no redundant deleted-only or amount indexes were added.

## Validation and manual checks before Phase 5

Strict TypeScript, ESLint, Expo dependency check, 33 repository/date/regression tests and Android production bundle export pass. The supplied October fixture totals €71 expenses, €50 income and −€21 net; Coffee totals €3, weekly average €10.14 and October daily average €2.29. Tests cover combinations/search literals, exact amount limits, pagination, edits/deletes, balance adjustments, previous-month edge cases, empty periods, leap/year boundaries, large amounts/overflow, index selection and upgrading a populated version-3 database.

Native Android/iOS UI and Expo SQLite runtime were not exercised here; no device/emulator is available. On your phone:

1. Reload after migration; keep the existing database. Confirm old transactions and search remain and Home renders without the BigInt error.
2. Test all five periods, Previous/Next, December/January, custom same-day and reversed dates, native date pickers and account selection.
3. Enter the October fixture, check exact summary/category totals, donut colors, small-screen and large-font layouts, and all twelve yearly months including zero months. Scroll the yearly chart.
4. Tap expense/income categories, verify dates/account/count/average, then open, edit and delete transactions. Return and confirm refreshed reports without restarting.
5. Combine category + account + dates + amount bounds + search; try `dinner`, Unicode accents and literal `%`/`_`. Test pagination, Apply, filter counts and Clear All.
6. Correct an account balance. Confirm history/balance change while expense/income reports remain unchanged. Repeat in airplane mode and after force-close/reopen.

Phase 5 has not been started.
