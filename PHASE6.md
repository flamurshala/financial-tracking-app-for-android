# Phase 6: authentication and offline-first cloud sync

## Supabase Setup

1. Sign into https://supabase.com/dashboard and create a **new project** in your organization. Give it a name, choose a region and database password, and wait for provisioning. The database password is not an app environment variable.
2. Open **SQL Editor → New query**. Paste the entire `supabase/schema.sql`, then **Run**. This file targets a fresh project; it is intentionally not a destructive reset or migration for an existing cloud schema. It runs table/policy setup in one transaction. Inspect the output for errors before continuing.
3. Open **Authentication → Sign In / Providers → Email** (the dashboard may label the section Providers) and ensure email/password sign-in is enabled. In **Authentication → Users → Add user → Create new user**, create your personal email/password user. Use the dashboard's auto-confirm option for your own test user, or confirm the email through your configured email flow. The app implements Sign In only; registration, password-reset links and invitation onboarding are not added. Do not use an invitation flow unless you separately complete setting its password.
4. Open your project's **Connect** dialog and copy **Project URL** and its client **publishable key**. **Settings → API Keys** also lists keys; the legacy `anon` key is supported. Never copy a secret key or `service_role` key. Current Supabase documentation recommends a publishable key; the application's existing environment-variable name remains `EXPO_PUBLIC_SUPABASE_ANON_KEY` and accepts either public format. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
5. In the project folder, copy `.env.example` to `.env` if needed and fill in:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
   ```

6. Run `npm install`, stop Metro, then `npx expo start --clear`. Scan with compatible Expo Go on the physical phone (or rebuild your development app after adding NetInfo). Open **Settings → Cloud Sync → Sign In** and use the user from step 3. Existing local data is uploaded; it is never erased or replaced wholesale.
7. In **Table Editor**, inspect `accounts`, `categories` and `transactions`. Every row has the signed-in `user_id`. Dashboard administrator access bypasses RLS, so seeing all users there is expected and does not prove client access is safe.

No project credentials were supplied during implementation. The schema and RLS were executed against development-only embedded PostgreSQL with a test `auth.uid()` shim and roles; live Supabase Auth, PostgREST deployment and phone acceptance are still required. `npm test` runs those SQL tests without cloud secrets or internet. The PGlite dependency is development-only and not imported by the mobile app.

## What changed

Created:

- `services/auth.ts`: validation, email/password sign-in, owner check, local-scope sign-out.
- `services/sync/cloudGateway.ts`: typed Supabase transport, server cursor, 200-row keyset pages and UUID UPSERTs.
- `services/sync/syncEngine.ts`: single-flight engine, ordered push/pull, conditional acknowledgement and atomic local merge.
- `database/repositories/syncRepository.ts`: ownership, pending counts, strict remote validation, conversion, merge and cursor persistence.
- `database/migrations/005_sync.ts`: local revision and accepted server-version columns, preserving existing rows/settings.
- `components/CloudLifecycle.tsx`, `store/syncStore.ts`, `types/sync.ts`: auth/network/app lifecycle, UI sync status and typed cloud contracts.
- `supabase/schema.sql`, `supabase/rls-check.sql`: fresh-project setup and dashboard acceptance test.
- `tests/auth.test.cjs`, `tests/sync.test.cjs`, `tests/supabase-schema.test.cjs`: session, data-integrity, restore and actual PostgreSQL policy tests.

Modified: login and Settings screens, root layout, auth/finance stores, Supabase client, SecureStore adapter, migration registry, package manifests, README and two existing schema-version test expectations. Finance CRUD, balances, calendar dates, reporting, filters and reminders retain their SQLite paths. NetInfo is the only new mobile dependency.

## Data/security model

Cloud tables are `accounts`, `categories`, `transactions`, plus a private-to-clients `finance_sync_heads` table. All have RLS enabled. Each financial table grants authenticated SELECT/INSERT/UPDATE only and checks `auth.uid() = user_id` using SELECT/INSERT/UPDATE policies. UPDATE checks both the old and new owner. Anonymous access and normal physical DELETE are denied; deleted rows remain tombstones for offline devices. Transaction references include the owner in `(user_id, account_id)` and `(user_id, category_id)` foreign keys with RESTRICT, so another user's record cannot be referenced. There are no destructive cascades.

The primary key is `(user_id, id)`, rather than global `id`: built-in category UUIDs are shared across users intentionally. The local category seed UUIDs from migration 3 are already stable and are preserved. Fresh untouched built-in categories adopt existing remote customization/tombstones before upload; custom categories and meaningful local edits upload normally. Custom categories with separately generated UUIDs remain separate, even if their names match. No data is deleted for deduplication.

Money uses BIGINT bounded to JavaScript's safe integer cents range, with positive transaction amounts. Currency remains EUR. No cloud computed balance is stored. SQLite continues deriving balances from initial balances and active income/expense/adjustment rows. `transaction_date` remains a DATE/`YYYY-MM-DD` financial calendar date, never a UTC timestamp.

Indexes cover `(user_id, sync_version, id)` on every financial table and active transaction date, account and category queries. Composite primary keys already index user ownership. Remote types are hand-authored to match the supplied SQL, and all downloaded values are runtime-validated before local writes. Malformed rows, unsafe amounts and missing references fail safely without advancing the cursor.

`finance_stamp_change` is a narrow SECURITY DEFINER trigger with an empty search path and an explicit caller-owner check. It locks/increments the caller's head row inside the same transaction, overwrites incoming `updated_at` with the server clock, assigns `sync_version` and prevents ID/owner changes. It preserves original `created_at` on UPDATE. `finance_sync_cursor` is a narrow SECURITY DEFINER function returning only `auth.uid()`'s published head. Authenticated clients cannot read/write the head table or directly execute the stamp trigger function. Do not grant broad privileges or expose additional SECURITY DEFINER write functions.

## Authentication and logout

Session restoration and auth-event handling live at app lifecycle level and do not gate the finance routes. Access/refresh session data is stored through Expo SecureStore in small Unicode-safe chunks; a new generation is written before atomically replacing its manifest. A failed refresh write keeps the old session readable. Passwords are submitted for login only, never persisted or logged. The client rejects secret-key format and legacy JWT roles other than anon, has a 20-second per-request timeout, and uses no admin/service-role APIs.

Auth refresh runs in the foreground and stops in the background. Offline local viewing/editing remains available even if the session expires; online sync can require sign-in again. Sign Out immediately invalidates in-flight sync authorization, removes this device's session (local scope), leaves SQLite intact and retains `local_owner_user_id`. Offline server revocation may not be confirmed, which is explained to the user; the local session is removed. An already in-flight network upload may complete for its original owner, but no subsequent local acknowledgement/pull is applied after authorization changes.

The first authenticated sync permanently binds this local dataset to its Supabase user ID, even if its network request later fails. A different account is blocked from sync; login detects the mismatch and signs it back out. Same-owner login resumes. This phase intentionally supplies no in-app owner-reset/account-switch action. Use a separate app installation/device for another account; do not manually clear metadata and silently upload one user's dataset as another.

## Synchronization and conflicts

1. Check signed-in user and NetInfo connectivity. A shared single-flight guard prevents concurrent cycles.
2. Claim/check the persisted local owner.
3. Read pending/error rows in 100-row batches and push accounts, categories, then transactions using the same UUID and current auth user ID. Archives, soft deletions and adjustments are included. Local saves never await this work.
4. Acknowledge only the exact uploaded `local_revision`. SQLite triggers advance that revision on pending edits, even when two edits have identical phone timestamps. Edits made during upload remain pending. Successfully acknowledged rows survive later partial failure; failed/unsent rows remain pending and are retried on the next trigger.
5. Read the server's published head and fetch changes from the prior cursor **inclusive** up to that head, paging by UUID with 200 rows per request. A mutation newer than this upper bound is picked up next cycle.
6. Merge accounts/categories/transactions in one dedicated SQLite write transaction and commit the new cursor and successful-sync display time together. Duplicate boundary reads are idempotent. Pending local rows cannot be overwritten by pulls; synced rows apply only newer server versions. Missing references, interruption or validation failure roll back the pull and retain the old cursor.
7. Refresh local UI and debug counts. Remote invalidation is marked `cloud` so it does not trigger an infinite save→sync loop.

**Conflict policy:** last accepted server write wins for separate device edits. Server versions, not phone timestamps, decide remote freshness. Pending local edits take priority until their upload is accepted. An offline edit uploaded later can therefore replace an edit made earlier on another device, regardless of the devices' wall clocks. There is no conflict history/CRDT or field-wise merge. Retrying an upload after a lost acknowledgement is a new server acceptance of the same UUID; it creates no duplicate row but can supersede another device's intervening edit. This is the explicit simple last-write-wins limitation. Do not use `transaction_date` or phone `updated_at` as a pull cursor.

A normal timestamp cursor can skip an older transaction that commits late. The per-user head lock avoids that problem: changes for that user acquire a transactional counter and publish it at commit. Bounds may include a row modified again while paging; if its latest version is above the bound, the next cycle retrieves it. A reference changed after the snapshot can temporarily make a restore batch incomplete; the local transaction then rolls back and the next trigger retries from the retained cursor. Heads/cursors must not be manually reset. Remote physical deletion or cloud reset requires a deliberate future restore/migration workflow.

Triggers: startup session restore, successful login, foreground, network changes/reconnect, local UI writes and manual Sync Now. Automatic triggers debounce for 750 ms, coalesce while a cycle runs, and retry only on subsequent normal triggers; there is no polling, Realtime, closed-app background service or aggressive failure retry. Requests can still fail even if NetInfo indicates connectivity. UI reports Not Configured, Not Authenticated, Offline, Syncing, Synced, Pending, Error or Account Blocked. Synced is the last completed cycle, not a live claim that no other device has since changed anything.

Network requests are paged/batched; a pull stages its changes in memory before one atomic SQLite merge. This is appropriate for a personal dataset and was tested across 425 transactions. Very large archives may require disk-backed staging later. No pagination cap silently truncates a restore. The client uses one UPSERT per pending row for precise acknowledgements; first upload may take time, and local finance use remains available.

## Acceptance tests before Phase 7

Use a physical Android phone, a fresh **test** Supabase project, and a second installation/device for restore and user-isolation tests. Never reset your only copy of unsynced finances. For offline tests in Expo Go, load the app bundle before airplane mode; a fully closed dev app may need Metro to load its bundle. Use an installed release build to test cold offline startup without Metro.

1. **Online create:** sign in, create Coffee €1, confirm immediate SQLite history/balance, then Settings → Cloud Sync reaches Synced with pending transactions 0. In Table Editor find one UUID with `amount_cents=100` and your user_id.
2. **Offline/restart:** disconnect internet; add Coffee €1, Groceries €8 and Fuel €30. Verify history/balance immediately and pending transactions 3 (plus any earlier unsynced records). Close/reopen offline; records persist. Reconnect and expect one cloud row per UUID and pending counts 0.
3. **Edit/delete:** offline, change Fuel €30 to €35 and delete Groceries. Confirm immediate balance/history changes. Reconnect: same Fuel UUID has 3500 cents; deleted Groceries UUID has non-null deleted_at, and is absent from ordinary history. Add a balance correction; verify its adjustment flag and derived balance survive sync.
4. **Restore:** after source device is Synced, use an empty second installation, sign into the SAME user. Wait for sync. Verify account balances, transaction count/dates, archived accounts/categories and soft deletions match. Default categories must not duplicate or revert customized names. The restored app must then work offline through SQLite.
5. **Repeated/overlapping triggers:** Sync Now ten times sequentially; verify unchanged UUID counts/balances. Trigger reconnect, foreground and Sync Now close together, and use Save & Add Another repeatedly. Expect one active cycle, eventual pending counts 0 and no duplicate rows. Edit a row while syncing and check the newer edit remains pending until uploaded.
6. **Partial failure:** disconnect during sync or temporarily use a test project with an unavailable transactions endpoint. Expect Offline/Error, the local-safe-data explanation, retained pending rows and no data loss. Reconnect/fix setup, then Sync Now; verify recovery. Do not destructively modify a production schema to simulate this.
7. **Session:** close/reopen online and confirm your email remains signed in. Reopen an installed app offline, verify finances are accessible even when a token is expired, then reconnect and verify refresh or readable sign-in requirement. Test invalid credentials and email confirmation errors. No password/token/full-record logging should appear.
8. **Logout/owner:** Sign Out. Finances/balances/reminder settings remain; cloud sync stops. Sign in again as the same user and verify sync resumes. Attempt another user's login on the owner-bound device: expect the ownership warning and no upload. Use a separate clean installation for the second user instead.
9. **Live RLS:** create user B in Authentication → Users. Have A sync at least one account/category/transaction; copy A and B Auth UUIDs and an account UUID belonging only to A. In SQL Editor paste `supabase/rls-check.sql`, replace its three UUID placeholders and Run. Expect completion with ROLLBACK and no custom exception. It explicitly SETs the authenticated role/JWT claims; ordinary dashboard SELECTs as postgres bypass RLS. Also sign in as B on a clean second installation and verify only B's own data is downloaded.
10. **Regression:** test entry/edit/delete, account archive/adjustment, filters, statistics, settings persistence and the existing daily notification/test notification. Run `npm run typecheck`, `npm run lint`, `npm test` locally. These checks supplement phone/PostgREST acceptance; they do not replace it.

Do not begin Phase 7 until live project, restore, ownership and physical-device acceptance pass.

## Implementation verification

Completed checks: `npm run typecheck`, `npm run lint`, all **45** tests via `npm test`, `git diff --check`, and `npx expo export --platform android` including Hermes bytecode. Tests exercise the shipped schema/policies and dashboard RLS-check script in embedded PostgreSQL, real file-backed SQLite migration/persistence, mocked native SecureStore/auth, and the real sync engine with simulated cloud transport. They cover grants/ownership on all three financial tables, cross-owner foreign keys, denied deletes, safe money ranges, atomic server cursor rollback, session write failure, owner mismatch, offline edits/deletes, adjustments/archives, partial failures, in-flight edits, single-flight protection, repeated sync and a 425-transaction restore.

These are implementation checks, not a claim that your Supabase project is configured or that physical-phone acceptance has passed. Live email/password login/session refresh, PostgREST transport, deployed RLS and reconnect/device tests remain in the checklist above. No Phase 7 work has been started.
