# Core local finance database · Phase 2

SQLite remains the source of truth. Repositories accept the database from `useSQLiteContext()`; keep repository calls in hooks/services and future form submit handlers. No SQL belongs in presentation components. No cloud synchronization or new financial UI was added.

## Schema and migrations

All finance records use UUID strings, UTC event timestamps (`created_at`, `updated_at`), nullable `deleted_at`, and `sync_status` (`pending`, `synced`, `error`). New, edited, archived and soft-deleted records are pending. No sync worker changes them yet.

| Table | Core fields | Behavior |
| --- | --- | --- |
| accounts | name, type, currency, initial_balance_cents, is_archived | Cash, bank, card, savings, other; EUR default. Archive hides the account from new-entry choices while preserving money/history. |
| categories | name, type, icon, is_default, is_archived | Expense, income or both; custom names and optional icons supported. Archive retains transaction references. |
| transactions | account_id, category_id, type, amount_cents, description, transaction_date, is_balance_adjustment | Positive cents, expense/income sign, required free-form description, validated local calendar date. Foreign keys restrict physical removal of referenced accounts/categories. |

- **1:** existing metadata migration, unchanged.
- **2 (`002_finance.ts`):** finance tables, money/type constraints, foreign keys, archive flags, active date/account/category indexes, and sync-status/updated-at indexes for each entity. No extra standalone type index until query evidence justifies it.
- **3 (`003_default_categories.ts`):** 25 default categories with stable UUIDs and idempotent insertion. Existing names/icons/archive preferences are never overwritten on startup. Treat the seed lists/order as part of this immutable migration; future defaults belong in a new migration.

Initialization validates the ledger sequence, upgrades in one exclusive transaction and records only successful migrations. Upgrade failures roll back and retain prior user data. There are no destructive reset migrations or hard-delete repository functions.

## Money and balances

All canonical amounts are safe integer **cents** in TypeScript and SQLite `INTEGER`. `decimalToCents('51.60')` and `decimalToCents('51,60')` return `5160` by parsing digit strings with BigInt, without multiplying floating-point EUR. Input accepts ungrouped nonnegative decimal strings, rejects signs, currency symbols, thousands separators, exponent notation and more than two decimal places. Zero is allowed for initial balances; transaction validation rejects zero. Account opening balances may be signed integer cents.

`centsToDecimal(5160)` returns `'51.60'`; `formatAmount(5160)` returns a configured EUR display. `validateCents()` and Zod business schemas reject fractions/unsafe integers. `sumCents()` accumulates using BigInt, then returns a safe integer or throws on overflow. EUR formatting uses integer whole units and exact cent digits, including at the safe-integer limit.

Account balance = initial balance + all active income − all active expenses, including signed-by-type balance adjustments. Balances are derived from a single SQL snapshot and never stored as mutable counters. Combined balance includes archived accounts because they still represent owned funds; soft-deleted accounts are excluded. Soft-deleted transactions do not affect either balance.

Adjustments have `is_balance_adjustment = true`, a null category and a positive amount. Type `income` increases balance, `expense` decreases it. They are excluded from ordinary income/expense totals. There is no adjustment UI. Totals exclude soft-deleted transactions and are never limited by list pagination.

`transaction_date` remains `YYYY-MM-DD`; created/updated/deleted timestamps are separate event timestamps. No UTC conversion is performed on the financial calendar date.

## Categories

Expense defaults: Coffee, Drinks, **Groceries**, Food, Lunch, Dinner, Fuel, Rent, Phone Top Up, Parking, Car, Hygiene, Medicine, Subscriptions, Entertainment, Clothing, Gifts, Other.

Income defaults: Salary, Freelance, Client Payment, Refund, Gift, Transfer In, Other Income.

**Groceries** is for ordinary supermarket/store purchases: food shopping, drinks, cooking supplies and household purchases. Food, Lunch and Dinner remain separate categories. Custom categories such as Engagement, Car Parts, Work and Travel use the same repositories as defaults.

## Repository API

| File | Functions |
| --- | --- |
| `accountRepository.ts` | createAccount, updateAccount, archiveAccount, getAccounts, getAccountById, getAccountBalance, getCombinedBalance |
| `categoryRepository.ts` | createCategory, updateCategory, archiveCategory, getCategoryById, getCategories, getExpenseCategories, getIncomeCategories |
| `transactionRepository.ts` | createTransaction, updateTransaction, softDeleteTransaction, getTransactionById, getTransactions, getTransactionsByDateRange, getTransactionsByCategory, getTotalIncome, getTotalExpenses |

Create/update inputs are exported from `utils/financeValidation.ts`. Updates replace all editable fields and preserve IDs/created timestamps/archive flags. Missing required input is rejected. Get-by-ID returns null for missing/deleted records and rejects malformed UUIDs. Update/delete/archive missing targets throw readable errors. Errors propagate to callers rather than being swallowed; future hooks should present safe UI messages.

`getTransactions` accepts account/category/type filters, inclusive calendar-date bounds, `includeDeleted`, `includeAdjustments`, and pagination (default 100, maximum 1000, offset 0). Ordering is date descending, creation time descending, then ID descending. By-ID lookup can opt into deleted records for inspection; ordinary lists hide tombstones. Deleted records cannot be edited back into existence. Repeated deletion is harmless.

Account/category lists hide archives unless explicitly requested. Both-type categories appear in both selection lists. Archived references can be retained while editing historical transactions but cannot be selected for new records or switched onto another transaction. Deleted references are always rejected. Category type changes that conflict with any retained transaction history are rejected, including soft-deleted history. All transaction reference validation and writes share an exclusive transaction.

For future multi-record atomic workflows, add repository operations that share a single transaction connection; do not nest the existing exclusive-write functions inside another exclusive transaction.

## Manual device verification before Phase 3

Use an isolated development database/device, with the repository API in a temporary development harness or debugger. Do not reset or uninstall a real user database.

1. Launch over an existing Phase 1 install with airplane mode enabled and Supabase variables absent. Confirm migration versions 1, 2, 3 and retained metadata.
2. Read categories twice across restarts: expect 18 expense and 7 income defaults, with Groceries correctly named and no duplicate seeds.
3. Create Cash using `createAccount(db, { name: 'Cash', type: 'cash', initial_balance_cents: 50000 })`. Use a valid expense category ID, description and `transaction_date: '2026-10-01'` to create a 3000-cent expense; balance should be 47000.
4. Create a 10000-cent income using an income category: 57000. Replace the expense input with 3500 cents via `updateTransaction`: 56500. Soft-delete that expense: 60000. Check the tombstone using `getTransactionById(db, id, true)` and confirm it is pending.
5. Create a custom category, archive it after a transaction references it, and confirm history still reads correctly while new-entry selection excludes it.
6. Verify 10, 20, 199, 5160 and 99999 cents format correctly on Hermes; confirm 10 + 20 = 30. Enter an impossible date, negative/zero/fractional transaction amount, missing description and invalid IDs: expect rejection without a row being inserted.
7. Close/reopen the app; confirm financial records persist and October 1 remains October 1, including with a different device timezone.

Automated equivalents run with `npm test` against actual SQLite and repository sources. Native UUID generation is substituted with Node Crypto in tests; on-device Expo Crypto and Expo SQLite still require the checks above.
