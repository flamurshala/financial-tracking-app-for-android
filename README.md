# Finance

An offline-first personal finance app for Android, built with React Native 0.86, Expo SDK 57, strict TypeScript, Expo Router, SQLite, Zustand UI state, React Hook Form/Zod and optional Supabase synchronization. It tracks EUR accounts, income, expenses, categories, auditable balance adjustments and calendar-based statistics. Local reminders, biometric App Lock, dark mode and manual CSV/JSON exports are included.

## Current release status

**Not ready because the installed-phone and live-cloud acceptance checks remain outstanding.** Automated checks cover financial behavior and local migrations, but they do not prove the installed APK, native sharing, biometric/privacy behavior, notification delivery or deployed Supabase RLS. See [PHASE8.md](PHASE8.md) for measured results, dependency advisories and the exact acceptance checklist. No Google Play submission or paid EAS build was performed.

## Architecture and offline operation

UI → repository/service → SQLite → sync engine → authenticated Supabase.

SQLite `finance.db` remains the local source of truth. Save/edit/archive/delete commits locally before sync; connection failure leaves records pending. Zustand holds UI preferences/status and filter state, not a replacement financial database. SQLite WAL, foreign keys, dedicated write transactions and consistent read snapshots protect local operations. Migrations 1–5 run in order inside a transaction, preserve existing data and reject a newer or nonsequential migration history. This phase adds no financial-data migration. Never clear a real database to fix an upgrade failure.

Accounts contain an initial balance in cents. Transactions reference accounts and historical categories; income adds and expense subtracts. Balance adjustments are ordinary signed income/expense records with an adjustment flag, appear in history/CSV/balances, and are excluded from spending statistics. Soft deletion sets `deleted_at` and sync pending rather than physically removing history. Archived accounts retain their money and history in combined ownership balances; archived categories remain attached to old transactions but are unavailable for new entries. Account/category restoration preserves identifiers.

All canonical money is safe integer cents. Parsing uses integer/BigInt arithmetic: `1`, `1.5`, `1.50`, `0.5`, `30`, `51.60`, `200` and ungrouped European `1,50` are accepted. Ambiguous thousands separators, signs in ordinary positive entry, more than two decimals, malformed input and unsafe values are rejected. Signed initial-balance/adjustment fields use their explicit signed parser. Financial sums and averages use integers; rounding affects only display/chart percentages. SQL integer SUM is never replaced with floating-point TOTAL. Overflow fails with an error rather than a rounded balance. Extremely large ledgers can exceed SQLite's signed 64-bit SUM limit and are rejected, not silently approximated.

Financial dates are local calendar `YYYY-MM-DD`, separate from UTC created/updated timestamps. Weeks start Monday, ranges include both endpoints, and month/year/leap boundaries are validated. Amount hiding on Home persists in SQLite and hides dashboard totals, summaries and recent-row amounts/accessibility labels; it is a display preference, separate from App Lock. Other finance screens remain available when unlocked.

## Setup and commands

Use Node 24 or a compatible Node version with `node:sqlite` for tests, npm, and a current Expo-supported Android toolchain. From PowerShell:

```powershell
Set-Location 'C:\Users\Flamur Shala\Desktop\financial tracking app'
npm install
npm start
npm run typecheck
npm run lint
npm test
```

For an installed development client:

```powershell
npx expo start --dev-client
```

Local native compilation requires Android Studio/SDK, Java and an emulator or connected device:

```powershell
npx expo run:android
```

This generates the ignored Android project, compiles it locally and installs the development build. EAS builds use hosted builders instead and do not require your own Android compiler. A preview APK runs independently of Metro; a development-client APK expects the development server.

Android Expo Go intentionally reports reminders unavailable instead of importing an unsupported native notification module. Use an installed development/preview build for complete tests. Previous emulator verification encountered an Expo Go loader failure before the JS bundle loaded; that is not an app runtime pass. Rebuild the client after native dependency/configuration changes.

## Supabase setup, RLS and ownership

Cloud is optional; leave public variables unset for local-only finance. To enable it:

1. Create a Supabase project and enable email/password authentication. Create/confirm your user account through Supabase; the app provides sign-in, not a registration flow.
2. In a **fresh project**, execute the complete [supabase/schema.sql](supabase/schema.sql) using Dashboard → SQL Editor. This installs tables, owner-bound composite foreign keys, constraints, RLS policies, server-stamped versions, triggers and `finance_sync_cursor`. The script creates objects and is not an idempotent upgrade script: do not rerun it blindly in an existing populated project.
3. Copy `.env.example` to `.env` only if you have not already configured `.env`. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to your project URL and public publishable/anon key. Never put a service-role/secret key or user password in source or public variables. Existing `.env` was preserved.
4. Restart Metro after environment changes; native embedded builds must be rebuilt to change their public bundle configuration.
5. Sign in, Sync Now, and verify the rows and last-sync status. Run [supabase/rls-check.sql](supabase/rls-check.sql) after replacing its A/B/account UUID placeholders. Its test writes roll back. Independently confirm User A cannot SELECT/UPDATE/DELETE User B rows or INSERT as B. The checked-in SQL passes embedded PostgreSQL tests; your deployed project's policies and grants must still be checked.

RLS enables independent server enforcement; UI restrictions alone are insufficient. Local dataset ownership is bound to its first synchronizing account through `local_owner_user_id`. Signing in as another user must block sync instead of cross-uploading data. Sign-out stops synchronization and removes this device's saved session; it keeps local finances, dataset ownership and App Lock policy. There is no separate local user-profile switch.

Sync uploads bounded pending batches, uses UUID identity, protects newer in-flight local revisions and pulls changes through a server cursor. References and cursor are merged transactionally. Network/validation failure cannot clear local finance tables. Only explicit tombstones represent deletion. **Empty new-device SQLite + populated cloud = restore; it never means delete cloud data.** New installs may show built-in categories while restore runs; verify sync status before treating empty balances as final. First large restores gather remote pages before the atomic merge, so peak memory still grows with restore size; 110,000-row native restore has not been benchmarked.

On device A create/sync data, then install on B with empty SQLite and sign in as the same user without recreating accounts. Compare balances/statistics/UUID counts, create an entry on B, sync and verify it reaches A. Repeat sync and ensure no duplicates. Do not uninstall or clear device A's real database to create the fresh B fixture.

## Notifications and App Lock

Settings → Notifications controls one daily local reminder (22:00 default), time, permission and status. Reconciliation replaces stale schedules and prevents duplicates. Messages contain no financial balances. Enable notification permission and the Finance Reminders channel; device battery/Do Not Disturb policies can affect delivery. Schedule two minutes ahead and observe exactly one notification in an installed build, then test disable/re-enable, restart, changed time and lock interaction. The development test button schedules a separate three-second test notification.

Settings → Security enables App Lock only after successful enrolled-biometric verification. Unlock supports the OS device-credential fallback. No custom PIN is stored. Policy is in SecureStore; it works offline and independently of cloud sign-in. Cold start always requires unlock when enabled. Background timeout choices are immediate, one, five or fifteen minutes. All routes/deep links/notification launches share the root gate; unresolved/locked content is not exposed to touch or accessibility. Capture/recents protection is requested using the platform API and errors are shown.

App Lock is a UI gate, **not SQLite encryption** or protection against a compromised OS/rooted device/extracted files. Device-level screen lock and storage protection remain important. Biometrics, OS fallback, cancellation, cold start, deep links, recents and background return need physical-device tests. Web is not the supported secure finance target.

## CSV and local backup exports

Settings → Data → Export Data offers all transactions, this month, this year or inclusive custom dates. History → Export matching transactions captures the currently entered search plus filters and exports **every matching row**, not just the visible 50. A selected adjustment-exclusion filter is respected; ordinary all/month/year/custom exports include adjustments. Deleted transactions are excluded; archived account/category names remain historical.

CSV has Date, Type, Amount, EUR currency, Description, Category, Account, Is Balance Adjustment, Created At and Updated At columns. Amount `5160` cents becomes `51.60`, always dot-decimal. UTF-8 BOM supports spreadsheet Unicode detection; quoted cells escape double quotes and preserve commas, line breaks, apostrophes and Albanian characters. Untrusted text starting with spreadsheet-formula characters receives a leading apostrophe; the stored description is unchanged. Import as UTF-8, comma-separated with decimal dot if your spreadsheet's European locale defaults to semicolons. Sort by the date column as needed: export rows use stable UUID ordering for fast keyset pagination.

JSON backup is manual export-only: all finance records, including archive/deletion state, schema/format version, export time and whitelisted display/reminder preferences. Amounts remain integer cents. Authentication/session tokens, arbitrary metadata, local cloud-owner ID, App Lock policy and SecureStore material are excluded. There is no JSON import/restore feature; cloud restore remains the supported automated restore path.

Both exports use a dedicated read-only SQLite snapshot, 500-row batches, private Expo cache files and Expo Sharing. File names contain scope/date, timestamp and UUID with safe characters. No automatic upload occurs. The sharing sheet lets you choose another app/save destination; opening it does not prove that the file was saved, and cancellation has no success assertion. Failed/interrupted file preparation removes its partial file. Background/lock/unmount during preparation blocks sharing at checkpoints.

Export files are plaintext financial copies. They remain in private temporary cache until OS cleanup or a later export removes files older than 24 hours; cleanup is not a timer. OS sharing grants recipient apps read access and recipient copies are outside Finance's control. The current Android sharing implementation also grants URI access to chooser-resolvable packages during sheet creation; use trusted installed apps. Device tests must verify Unicode, attachment completion, cancellation, large exports and App Lock return behavior.

## Android and EAS builds

`app.json` keeps Finance, slug finance-foundation and version 1.0.0. Android package is `com.flamurshala.financetracker`, initial versionCode 1; future iOS bundle identifier uses the same value. Choose any rename before distribution and then keep the package/signing identity stable. Icons remain placeholders. Source configuration blocks external-storage, contacts, camera, microphone and location permissions; private-cache export does not require broad storage access. Notifications/biometrics/network remain relevant. Verify final merged manifest permissions after compilation; development tooling may include overlay permission.

[eas.json](eas.json) selects explicit EAS environments and artifact types:

| Profile | Environment | Artifact | Use |
| --- | --- | --- | --- |
| development | development | APK, development client | Native debugging with Metro |
| preview | preview | APK, internal distribution | Installable personal acceptance build |
| production | production | AAB | Future store distribution |

Initialize/link your Expo account and project yourself, retain the generated project ID in app config, and configure signing credentials:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform android
```

Download/install the preview APK on your phone (allow installation from the chosen trusted source), then run the checklist before real financial use. Keep the same signing keystore for upgrades and retain recovery access to the EAS/Expo account. No build or Play submission is triggered by checking in this configuration. An AAB is not directly installable like an APK. All profiles share the same package, so they cannot coexist as separate apps on one phone; different signing credentials can prevent upgrading an existing installation. Back up/sync real data before changing signing/install mode.

EAS uses selected development/preview/production environments. In EAS Project Settings → Environment variables, add the two public Supabase variables in all environments used for cloud builds, visibility Plain text. One project may serve personal use initially; test accounts prevent test data from polluting your real dataset. Values with `EXPO_PUBLIC_` are readable in the bundle and must never contain secrets. Example commands with placeholders:

```powershell
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value 'https://YOUR_PROJECT.supabase.co' --environment preview --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY' --environment preview --visibility plaintext
npx eas-cli@latest env:list --environment preview
```

Repeat for development/production. See [current Expo environment instructions](https://docs.expo.dev/eas/environment-variables/manage/) and [build-profile documentation](https://docs.expo.dev/build/eas-json/). `.env` files are ignored and should not be your hosted-build configuration. Preserve version history: increase `expo.version` for user-visible releases; production `autoIncrement` with local version source increases Android versionCode, and resulting config changes should be retained before the next build. Ensure preview/development versionCode is suitable for installed upgrades.

## Verification and limitations

Run `npm run typecheck`, `npm run lint`, `npm test`; tests execute real file-backed SQLite SQL/migrations and embedded PostgreSQL schema/RLS with mocked native interfaces/auth/transport. They are not full end-to-end phone or live Supabase tests. The release checklist includes precise daily balance changes, all filters/reports, offline restart, A/B cloud restore and owner isolation, notification and App Lock behavior, spreadsheet export and small/typical/large phone layouts.

Dependency advisories remain in Expo-related transitive tooling/router packages. Compatible updates were checked without forcing a major downgrade. See PHASE8 for exact counts and relevant paths. Native APK/AAB compilation/signing, EAS linking/environments, deployed RLS, actual phone sharing/notifications/biometrics, first large restore memory and responsive/dark-mode inspection remain release gates. Keep an independent cloud/export copy; uninstalling an app can remove local SQLite.

Future iOS requires Apple Developer credentials/signing and an EAS iOS build; the Face ID usage description is already configured. Test enrolled Face ID, OS fallback, local notification permissions, picker behavior, sharing and app-switcher privacy on a real iPhone. Do not assume Android validation certifies iOS.
