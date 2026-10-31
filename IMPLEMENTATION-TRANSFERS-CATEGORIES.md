# Transfers and category deletion implementation report

## Initial analysis

The checked-out repository was clean before implementation. The source of truth was the current Expo Router application, not earlier architecture descriptions. `package.json` and installed top-level dependencies agree: Expo 57, React Native 0.86, React 19, expo-sqlite, Supabase JS, Zustand, React Hook Form/Zod, date-fns, PapaParse, native notifications and authentication modules. `npm ls --depth=0` passed. TypeScript strict mode remains enabled.

Routes live in `app`, reusable UI in `components`, SQLite access in `database/repositories`, orchestration/native adapters in `services`, financial types in `types`, and UI invalidation/auth/sync preferences in Zustand stores. Financial records remain SQLite-owned. Existing tests exercise actual repository SQL through a Node SQLite adapter, simulated cloud gateways, PGlite PostgreSQL, and mocked native APIs.

Transactions have UUID, account/category foreign keys, expense/income type, positive integer cents, required stored description, financial date, adjustment flag, timestamps/deletion marker and sync status. Migration 4 adds normalized description search; migration 5 adds local revision/server version. Normal entries require a category; adjustments require a null category. Blank descriptions are resolved to the selected category name. Editing/deleting transactions remains unchanged.

Original account balance = opening balance + all nondeleted income − all nondeleted expenses, including adjustments. Archived accounts retain their owned money in combined balance. Negative opening balances and expenses exceeding account balance are permitted. Adjust Balance records the difference from the derived current balance as an excluded-from-reports adjustment transaction.

Categories have UUID, name, expense/income/both type, icon, built-in/archive flags, timestamps and deletion/sync metadata. Names are not unique. Existing management supported archive/restore and custom editing; Other IDs were specially protected from archiving. Category type edits already checked all transaction history. Both SQLite and PostgreSQL category/account foreign keys use RESTRICT, never financial-record cascade deletion.

SQLite migrations 1–6 provide metadata, financial tables, one-time default seeds, reporting/search, sync revisions and CSV import batches. Database initialization runs unapplied migrations atomically and never recreates seeds on ordinary startup. Default migration 3 uses stable IDs and preserves existing records/tombstones on ID conflict. No seed rewrite was needed.

Original sync entities were accounts, categories and transactions, in that dependency order. The engine uploads local pending revisions, acknowledges only the uploaded revision, then pulls bounded server-version pages into one local transaction. Cloud ownership and composite foreign keys include the authenticated user; DELETE is denied in favor of tombstones. Fresh built-in seeds already defer to cloud customizations. Transfers were absent; transaction history and its filters/statistics are explicitly expense/income-specific. A dedicated transfer history avoids changing transaction editing or pretending transfers are income/expenses.

CSV transaction exports stream filtered rows in a read snapshot; JSON backups include financial records and tombstones. CSV imports validate expense/income rows, resolve active/nondeleted names to IDs, preview unknown categories and require approval to create custom categories with new UUIDs. Deleted category names therefore already follow the unknown-category flow.

## Implementation

### Account transfers

Migration 7 adds only `transfers`, indexes and a pending-revision trigger. It does not rebuild, delete or reset any existing table. A transfer contains UUID, source/destination account UUIDs, positive safe integer cents, validated calendar date, note, timestamps, tombstone and local/cloud revision metadata. Account foreign keys use RESTRICT and source must differ from destination. Repository validation and writes share an exclusive SQLite transaction.

Balances now add incoming and subtract outgoing nondeleted transfers. Edits replace the transfer record; changing accounts removes the old derived effect automatically. Deletion sets a pending tombstone. Combined balance remains unchanged, and all income/expense/category/net statistics continue reading only normal transactions. Negative balances remain allowed. Writes reject results outside exact integer cents. New transfers require active accounts; an existing transfer may retain archived endpoints while being edited.

Accounts has Transfer Money, Transfer History and per-account Transfer actions. The form preselects the requested source and allows changing it. Paginated Transfer History is accessible from Accounts and Transactions. Details show source, destination, amount, date and note, with edit/delete confirmation. This is separate from the main transaction feed and its filters.

Transfers use the existing local-first invalidation and sync lifecycle. Accounts upload/download before transfers. Transfer sync uses the same validation, pending counts, server stamps, conflict policy, pagination and transactional pull as existing entities. JSON backup includes transfers. A separate Transfers CSV exports all active transfers with explicit record type and source/destination names. It does not apply transaction filters. Transfer CSV import is intentionally unsupported.

### Category deletion

Every category, including built-ins and Other, has Delete Category. The flow loads reference counts, including soft-deleted history, selects compatible active replacement IDs, previews the move, then requires a final confirmation. With no references only confirmation is required. Mixed income/expense references require a both-type replacement; no replacement means a clear instruction to cancel and create one first. Duplicate-name choices include type and ID suffixes.

The repository rechecks eligibility inside one SQLite write transaction, bulk-updates every referencing transaction (including deleted history), and tombstones the category. Descriptions/search text, transaction IDs, amounts, dates and existing transaction deletion markers remain unchanged. All reassigned transactions and the category become pending with revision tracking. Failure rolls back the entire operation. Existing UI invalidation immediately refreshes balances, category choices, filters and statistics.

Default seeds remain one-time migration data. Tombstones stay stored locally and in Supabase. Fresh-device cloud lookup adopts deleted defaults. Sync now also gives cloud category tombstones priority over stale pending category edits, preventing accidental resurrection. An incremental PostgreSQL trigger preserves an existing category deletion marker even when an older client uploads a stale edit. Category deletion is terminal; physical cleanup is not implemented.

## Migrations and deployment

- SQLite: `database/migrations/007_transfers.ts`, version 7 (`account_transfers`). Existing migrations are preserved.
- Existing Supabase deployment: run `supabase/migrations/007_transfers.sql` once in SQL Editor before this app version synchronizes.
- Fresh deployment: run the full `supabase/schema.sql`; it includes the increment. Do not also apply the incremental script.
- Cloud increment creates transfers with composite owner/account foreign keys, server stamps, sync indexes, owner-only SELECT/INSERT/UPDATE RLS and no DELETE privilege. It also installs the terminal-category-deletion trigger. No cloud data was changed by this development session.

## Validation

TypeScript and ESLint were run using the bundled Node 24 runtime. The laptop default is Node 20, which cannot run `node:sqlite` tests; npm on this laptop resolves that older runtime even with a temporary PATH override. Use Node 24 explicitly or select Node 24 through the laptop's Node manager before running npm scripts.

Final results: **85 tests passed, 0 failed**. TypeScript, ESLint and `git diff --check` also passed.

Automated coverage includes:

- Bank 100000 / Cash 20000 cents → transfer 10000 → 90000 / 30000, total 120000, zero income/expense change.
- Edit to 15000 → 85000 / 35000; change destination to Card → Cash effect disappears; deletion restores the original balances.
- Bad/zero/negative/fractional/unsafe amounts, invalid dates, identical endpoints, archived new endpoints, retained archived history and permitted negative balances.
- Offline SQLite restart, sync failure/retry, account-before-transfer ordering, fresh-device restore, transfer edits/deletions propagated to another database.
- Separate transfer CSV and JSON backup content.
- Category with no transactions; 50 active transactions plus deleted history; unchanged descriptions; replacement statistics; duplicate names; mixed types/no valid replacement; rollback induced by a failing SQLite trigger.
- Built-in deletion surviving restart and cloud restore; offline category reassignment/deletion sync; stale pending category rename cannot resurrect the cloud tombstone.
- SQLite upgrade preservation from versions 1–6, repeated initialization, foreign-key checks and integer-cent checks. Primary keys enforce unique UUIDs.
- Actual PostgreSQL full schema and incremental migration preserving existing rows; transfer RLS isolation/spoof rejection, cross-owner foreign-key rejection, amount/same-account constraints, server version stamps, physical DELETE denial and terminal category deletion.
- Existing regression suite: transactions and description fallback, accounts/archive/adjustments, statistics/search/filters, CSV import/export, mocked authentication, sync/restore, notifications/reminders and App Lock.

## Limitations and manual checks

No live financial SQLite file or real Supabase account was opened or modified. Network sync/restore behavior was exercised through the actual sync engine with simulated gateways; PostgreSQL constraints/RLS were exercised in PGlite. This is not a claim of completed real-device or production Supabase testing.

Before real financial use: apply the incremental SQL to a test Supabase project, test signup/login and transfer/category sync between two physical devices, airplane-mode saves and restart, actual sharing sheets, small-screen form/picker behavior, native notifications and biometric App Lock. No native build/emulator UI session was available during this work.

The existing server-acceptance conflict model remains. Category reassignment is atomic locally but multiple cloud row uploads are not one server transaction; another device can temporarily observe a category tombstone before every reassigned row is uploaded. Retained category tombstones preserve foreign-key references, and later successful sync sends the remaining pending rows. Synchronize devices before bulk category deletion: a concurrent new transaction on another offline device can still reference the deleted category, and bulk reassignment does not retroactively discover transactions absent from the deleting device. Such records are preserved, but may require later editing to a replacement category. Terminal deletion prevents category resurrection, not distributed transaction reassignment. No new conflict-resolution subsystem was introduced.

## Files created

- `app/transfer/[id].tsx`
- `app/transfer/add.tsx`
- `app/transfers.tsx`
- `components/finance/CategoryDeletionForm.tsx`
- `components/finance/TransferForm.tsx`
- `database/migrations/007_transfers.ts`
- `database/repositories/transferRepository.ts`
- `supabase/migrations/007_transfers.sql`
- `tests/transfers-categories.test.cjs`
- `IMPLEMENTATION-TRANSFERS-CATEGORIES.md` (this report)

## Files modified

- `DATABASE.md`
- `README.md`
- `app/(tabs)/accounts.tsx`
- `app/(tabs)/settings.tsx`
- `app/(tabs)/transactions.tsx`
- `app/_layout.tsx`
- `app/categories/index.tsx`
- `app/export.tsx`
- `database/migrations/index.ts`
- `database/repositories/accountRepository.ts`
- `database/repositories/categoryRepository.ts`
- `database/repositories/exportRepository.ts`
- `database/repositories/financeReadRepository.ts`
- `database/repositories/syncRepository.ts`
- `services/exports.ts`
- `services/sync/cloudGateway.ts`
- `services/sync/syncEngine.ts`
- `store/syncStore.ts`
- `supabase/schema.sql`
- `tests/exports.test.cjs`
- `tests/foundation.test.cjs`
- `tests/management.test.cjs`
- `tests/migration-upgrade.test.cjs`
- `tests/statistics.test.cjs`
- `tests/supabase-schema.test.cjs`
- `tests/sync.test.cjs`
- `types/finance.ts`
- `types/sync.ts`
