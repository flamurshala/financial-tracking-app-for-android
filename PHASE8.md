# Phase 8 — Everyday-use release checklist

Date: 2026-10-02. Classification: **Not ready because of the following blockers**:

- Installed preview APK/native compilation and signing have not been verified; EAS account/project linking, build environment variables and signing remain to configure.
- Deployed Supabase RLS and the exact two-device restore/cross-account acceptance scenarios have not been run against the user's live project.
- Physical Android sharing/spreadsheet interoperability, reminder delivery, biometric/OS fallback, cold-start/deep-link/notification lock, screen capture/recents and screen-size/dark-mode inspection remain unverified.
- Dependency audit still reports 17 transitive advisories (12 moderate, 5 high). Compatible update checks did not resolve them; do not force npm's proposed SDK downgrades. Review these before production distribution.

No data-loss, migration, sync or financial-calculation bug was found in the executed automated checks. This does not replace the pending native/deployed checks. No financial database was reset and no Google Play submission occurred.

## Completed work and files

New: `app/export.tsx`, `database/repositories/exportRepository.ts`, `services/exports.ts`, `utils/exportCsv.ts`, `store/exportStore.ts`, `eas.json`, three export/migration test files and this checklist.

Modified: Settings/history export navigation, Home amount privacy, PeriodSummary/TransactionRow amount/accessibility hiding, preference loading/persistence, SQL account-balance aggregation, dedicated read snapshots, dashboard read transaction, safe notification logging, Android identifiers/permissions, dependencies/lockfile, README and validation notes. Existing Finance name and all schema migrations remain intact.

CSV supports all/month/year/custom/history filters, explicit local sharing, cents-to-decimal amounts, UTF-8 BOM, proper escaping and formula-safe text. JSON backup contains explicit finance fields/non-secret preferences only, including deletion markers; export-only. Successful files remain in private cache for share recipients and are pruned on a later export after 24 hours, not by a timer. Cancellation does not assert a save succeeded. See README for recipient/privacy and spreadsheet-import details.

## Automated results

| Area | Result and practical limit |
| --- | --- |
| Strict TypeScript | Passed after final source edits |
| ESLint | Passed after explicit Node Buffer import in export fixture |
| Android production JS bundle | Passed: 2,119 modules / Hermes bundle generated; APK/AAB native compilation is unverified |
| Expo config introspection | Package/version and broad-permission removal declarations confirmed; merged compiled manifest unverified |
| Automated suite | 67 tests passed; real file-backed SQLite/embedded PostgreSQL, native auth/sharing/notifications and transport mocked |
| Daily money flow | Exact 500 → 499 → 493 → 463 → 513 → 508 → 509 → 500, correction expense 9 EUR; adjustment excluded from normal reports |
| Money boundaries | Safe integer cents, comma/dot input, malformed input rejection, exact large sums, expense/income/account edit effects, soft deletion and overflow rejection covered |
| Migrations | New install/repeated init/failure rollback/newer-version rejection; upgrade from each version 1–4 to 5 preserves metadata and balances |
| Sync safety | Offline pending writes/restart, idempotency, pending edit races, failed pull rollback/cursor protection, archives/tombstones, ownership mismatch and empty-local cloud restore covered with mocked gateway |
| New-device restore | Automated multi-page >1,000-row restore passed; real A/B devices/live Supabase not run |
| RLS | Actual supplied schema executed under embedded PostgreSQL; owner SELECT/UPDATE/INSERT/DELETE and composite-FK checks passed; live deployment unverified |
| Notifications | Mocked permission/reconciliation/concurrency/restart/failure/test-delivery scheduling passed; physical delivery and two-minute exact-one scenario not run |
| App Lock | Controller/native-adapter/root-gate tests passed; physical biometric/passcode/recents/deep-link behavior unverified |
| Export | Quoting/newlines/Albanian text/exact cents/adjustments/tombstones/filtering and JSON secret exclusion passed; native API adapter closes before share, cleans failed open and blocks locked/background sharing |
| 110,000-row export | 12,540,123 bytes; largest emitted batch 57,000 bytes; about 1.2 seconds isolated / 1.7 seconds during full suite on desktop SQLite; no phone-speed claim |

Performance changes: account-list/Home balances use SQL integer aggregates returned as text and combined with the initial balance using BigInt; no full account×transaction rows cross into JavaScript. Dashboard/export read snapshots use WAL without reserving the writer. CSV uses UUID primary-key keyset pagination in 500-row batches, avoiding the 51-second repeated chronological-sort query found during testing. Existing history remains virtualized and paginated (50 rows), report totals/groups stay in SQL and sync remains incremental. Some single-account/combined-balance helpers still materialize ledger rows; initial cloud restore accumulates a full merge batch. These need native large-ledger profiling before claiming long-term 110,000-row restore performance.

Dependency audit: node-forge <=1.4.0 RSA signature verification advisory under Expo tooling, decode-uri-component <=0.4.2 malformed-percent decode DoS under router/query-string, and uuid <11.1.1 buffer bounds advisory under xcode/Expo config. npm audit's downstream package count includes cascades, not 17 distinct app exploit paths. `npm update node-forge decode-uri-component` within compatible constraints changed nothing. No major overrides or forced SDK 44/router 5/date-picker 8 downgrade was applied. Native/runtime reachability and upstream patched compatible releases remain review items.

Security review: source-backed independent baseline, architecture and focused ownership/export reviews found no reportable attacker-to-victim vulnerability in reviewed application paths. Owner/schema/SQL/SecureStore/lock/export controls were traced. Source-level permission introspection is not proof of the merged APK manifest. Audit limitations include native runtime, live deployment and full dependency internals; the generated Codex Security report records honest coverage rather than release certification.

## Manual acceptance record

Run on an **installed preview APK** using a dedicated test Supabase account; record build version/code, Android/device model, date and pass/fail evidence. Preserve real device A's data. Test fresh B separately instead of clearing a real dataset.

### Fresh install and daily flow

1. Fresh install; confirm one set of built-in categories and no duplicate seeds after five force-close/reopens. Create Cash, initial €500. Use a single chosen financial date, e.g. 2026-10-01, for this fixture.
2. Expense Coffee €1 → €499; Lunch €6 → €493; Fuel €30 → €463.
3. Income Client Payment €50 → €513.
4. Edit Fuel €30 → €35 → €508. Delete Coffee → €509; ensure the deleted row disappears from history/reports, has a tombstone and syncs that tombstone.
5. Adjust actual cash to €500 → one expense adjustment €9; Cash €500. Second correction to the same actual amount adds no row. Adjustment remains visible in history/export and excluded from normal spending reports.
6. For that chosen day/week/month/year/custom range, normal income €50, expense €41, net €9. Confirm Home current-month/day selection agrees with the financial date; don't compare a past fixture to today's summary.
7. Separately test amount, date, description, category, account and expense↔income edits. For expense €30 moved Cash→Bank, Cash increases €30 and Bank decreases €30, total unchanged. Expense €50→income €50 raises total €100. Avoid mixing these changes into the daily fixture's expected amounts.
8. Create/archive/restore a custom category and account. Historical names/reports/balances remain; archived choices aren't offered for new entries; Other remains available. Last-account archive warning should be explicit.

### Filters and offline/restart

1. Verify Fuel + This Year; Coffee + Cash + This Month (deleted coffee gives no result); Income + custom dates; description + category; escaped `%`, `_`, quotes and Albanian text.
2. Try `1`, `1.5`, `1.50`, `0.5`, `0.50`, `30`, `51.60`, `200`, `1,50`; reject `.`, `1..5`, `abc`, `-5`, NaN, Infinity and thousands grouping in ordinary amount entry.
3. Verify Save & Add Another keeps date/account/type and resets relevant entry fields; rapid taps save only once. Keyboard/focus/labels remain comfortable.
4. Disable network after the daily fixture; add €4 Groceries + €2 Parking → €494. Pending status appears, and restart offline retains both rows/balance/settings. Reconnect, sync and repeat; no duplicate rows.
5. Hide Home amounts and force-close/reopen; preference persists and accessibility doesn't announce hidden amounts. Show them and verify data was unchanged. Other screens are still readable after unlock.

### Cloud restore and cross-account isolation

1. Device A: sign in, create Cash €500 plus expenses/income/custom category, sync, and verify owned accounts/categories/transactions in Supabase. Note balances, totals and UUID counts.
2. Device B: fresh app with empty SQLite; sign in as the same account; create no manual finance data; run initial sync. Confirm A's accounts/categories/transactions, matching balances/reports and no duplicate categories/UUIDs. Empty B must not delete any cloud rows.
3. Create an entry on B, sync, then sync A. Entry appears once on A. Repeat sync on both. Test a deleted/archived row and an offline edit reaching the other device.
4. On A's owned dataset, sign out then attempt another test User B. Sync must block with an understandable owner warning; no A row uploads under B. Sign back in as A without losing local data.
5. Run the checked-in RLS SQL acceptance check in the real project with correct A/B IDs. Confirm direct authenticated A→B SELECT/UPDATE/DELETE/INSERT denial on all finance tables. Check RLS/grants on finance_sync_heads and caller-scoped cursor RPC too.
6. Simulate interrupted network/sign-out during sync and failed cloud validation; local rows and pending state remain. Verify the supplied schema deployment matches source; do not use the service-role key in the client.

### Native notifications and privacy

1. Grant notifications, enable reminder and set time two minutes ahead. Background the app; observe exactly one notification. Disable and confirm no daily request; change time/re-enable/restart five times and confirm one daily schedule. Developer three-second notification is separate.
2. Enable enrolled biometric App Lock; test success, cancellation, failed auth, OS credential fallback, timeout 20 seconds vs one-minute boundary/immediate mode, offline unlock and failure to read policy.
3. Force-close/cold-launch, open `finance://transaction/add` and an existing transaction deep link, and tap a reminder while locked. No protected financial content before policy/unlock. Android Back must not dismiss the lock.
4. Check app switcher thumbnails and screenshots while enabled, background/foreground during native authentication, notification shade and returning from sharing. Verify no stuck prompt/relock loop and clear notice if capture protection is unavailable.
5. Inspect final merged production Android manifest: no contacts/location/camera/microphone/broad storage permissions; network, notification, biometric/platform/device-tooling permissions must have a clear purpose. Verify backups/storage behavior and signing identity.

### Exports and usability

1. Add descriptions with `Çaj me Elonën`, commas, double quotes, apostrophes, multi-line text and `=HYPERLINK(...)`. Use a test account/category with punctuation. Export all/month/year/custom/current filters.
2. Save/share to a trusted spreadsheet destination; open UTF-8/comma/dot-decimal in Excel/Sheets/LibreOffice. Check dates, `100→1.00`, `220→2.20`, `5160→51.60`, currency, account/category, adjustment flag and timestamps. Formula-like text must stay text; quotes/newlines must not shift columns.
3. Export history with >50 matching rows; every matching row is present, no deleted rows. Sort date if desired (file order is UUID). Empty export contains headers; malformed custom dates show a concise validation error.
4. Cancel share, test unsupported destination/low storage/background/lock during preparation and a large dataset. No crash or false saved-success claim; partial files disappear. Completed cache files can survive for recipients; a later export prunes prior-day copies.
5. JSON contains finance data/deletion markers/non-secret preferences and schema/time, no tokens/password/owner metadata/App Lock secrets; import is unavailable and clearly labeled.
6. Inspect all screens/settings/forms/charts/pickers/lock/share return in System/Light/Dark and small/typical/large Android phone widths plus larger text. Buttons remain at least comfortable touch size, income/expense use text/signs beyond color, form errors/readable labels and keyboard avoid obscuring Save.

## Build configuration and next action

Finance 1.0.0, Android `com.flamurshala.financetracker`, versionCode 1; same future iOS bundle ID. EAS development client APK, preview internal APK, production AAB; production auto-increments local Android versionCode. Preserve signing key/package across upgrades. Current assets remain placeholders.

Use README's exact install/Metro/local Android/EAS commands. First link Expo/EAS project, configure public URL/anon key for each build environment, set signing credentials, build/install preview APK, then record each manual check above. Do not start real-money tracking until the listed release gates are satisfied or consciously evaluated with an independent verified backup. Future iOS requires Apple signing/developer setup and its own physical acceptance tests.
