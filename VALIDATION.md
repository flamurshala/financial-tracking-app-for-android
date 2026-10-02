# Phase 3 validation · 1 October 2026

- Strict TypeScript: passed.
- ESLint: passed without warnings.
- `expo install --check`: installed dependency versions match SDK 57.
- Android production bundle export: passed, including all Router routes.
- Expo Metro startup: passed; local status endpoint reports running and Android manifest endpoint returns HTTP 200.
- Twenty-two foundation/finance/daily-workflow regression tests: passed. Actual file-backed SQLite and repositories cover the requested 500 → 470 → 570 → 565 → 600 sequence, exact cents/overflow, metadata-preserving upgrades, migration rollback, seed idempotency, custom/archived categories, safe references, validation, filters, totals, adjustments and pending tombstones. Date checks cover leap-year validity and local midnight formatting. The native UUID API is replaced by Node Crypto only in tests.
- Native Android launch, UI navigation and Expo SQLite/Expo Crypto runtime behavior: **not verified on device**. No Android SDK/emulator or attached device was available during these phases. Follow PHASE3.md device checklist before the next phase.
- npm audit: 14 moderate reports, no high/critical reports. The chains originate in Expo's xcode/uuid tooling and Router's query-string/decode-uri-component dependencies. npm proposes incompatible Expo/Router downgrades; no forced audit fix or arbitrary dependency override was applied.
- Metro emitted inherited terminal color environment warnings during export; these are tooling environment messages rather than source lint errors.
- No `.env` or real credentials were created. `.env` variants are ignored. No Git commits were created.

The bundled desktop environment supplied Node without npm on PATH. Validation used a temporary npm CLI outside the project and Node's Windows system CA support. For ordinary development install Node LTS including npm; no temporary runtime paths are required by this project.

Phase 2 preserves the existing Expo app, version 1 migration, startup provider and UI architecture. The only added dependency is Expo-compatible `expo-crypto` for native UUIDs. No Supabase synchronization or out-of-scope UI was implemented. Metro server startup evidence is retained from Phase 1; Android export and all code checks were run for Phase 2.

Phase 3 adds daily UI, dashboard queries, Unicode search, native date selection, remembered account preferences and atomic actual-balance corrections. The full €500 → €499 → €493 → €463 → €513 → €508 → €509 → €500 scenario passes. Save & Add Another reset/schema behavior and close/reopen persistence pass; native button interactions remain manual checks. Dedicated write connections explicitly enable foreign keys and obtain BEGIN IMMEDIATE before read/modify/write. No schema reset or additional migration was needed. The native date picker adds one audit cascade through existing Expo configuration tooling; no incompatible forced dependency downgrade was applied.


## Phase 4 validation · 1 October 2026

Strict TypeScript and ESLint pass. All 33 tests pass, including the original 23 regression tests and 10 reporting/filter/migration tests. Expo dependency versions pass `expo install --check`. Android production export compiles the new routes and chart library. Known October data verifies €71 expenses / €50 income / −€21 net and exact category totals. Tests cover Monday weeks, leap/month/year boundaries, inclusive custom dates, combined filters/Unicode/literal punctuation, pagination, edit/delete re-query, adjustment exclusion, safe-integer overflow, zero previous months and all twelve year months. The populated version-3 migration preserves timestamps, sync status and financial amounts while backfilling search. The partial reporting index is confirmed by SQLite EXPLAIN QUERY PLAN.

The BigInt formatter regression remains covered with an Intl implementation that rejects BigInt. Native Android/iOS rendering, chart layout, category navigation button interactions and Expo SQLite execution remain device checks; desktop SQLite tests and export do not prove native behavior. Use PHASE4.md's manual checklist before Phase 5. No sync, transfers or next-phase work was introduced.

Statistics crash fix: local query snapshots now retain their loader identity and are hidden immediately when period/range/account changes, before focus effects start the replacement query. Week/day and year/month insights also guard nullable results explicitly. Two hook lifecycle regression tests cover rapid period switching, obsolete async results and failed replacement queries. All 35 tests, strict TypeScript and ESLint pass. Reload and switch Month → Week → Year rapidly on device to verify native rendering.

## Phase 7 validation · 2 October 2026

Strict TypeScript and ESLint pass without warnings. Expo SDK dependency checks pass, including `expo-screen-capture` ~57.0.3. All 60 tests pass: existing finance/date/search/reminder/authentication/sync regressions plus controller, root-gate, native adapter and management tests. The actual PostgreSQL schema/RLS still passes its embedded PostgreSQL tests. Android production export compiles 2092 modules successfully. A JSX syntax scan found no raw text strings outside text containers in app/components.

Controller/gate tests cover private startup, native cancellation/error/no hardware/no enrollment, one-minute and immediate boundaries, offline unlock dependency separation, rapid taps, inactive system prompts versus actual background, invalidated pending auth, failed/corrupt secure reads/writes, persisted enabled setting after restart, secure policy key/options, biometric-only enable versus device fallback unlock, hidden routes/touch/accessibility and Android-back modal callback. Management tests verify archived category names/totals/history, restore/pending sync and theme across SQLite reopen.

A running Android Expo Go emulator was found, but its native loader failed before requesting this project's JavaScript bundle (remote-update/loader errors); a native runtime pass is not claimed. The temporary Metro test process disabled dotenv/cloud configuration and did not alter .env, device biometric enrollment or user financial data. Physical biometric prompts, OS screen capture/recents privacy, Android modal/route interaction, reminder delivery/tap and live Supabase remain manual tests in PHASE7.md. Android Expo Go already deliberately reports reminder notifications unavailable in this SDK; use a development build. Future iOS Face ID needs a rebuilt client and physical device.

npm audit currently reports 11 moderate and 5 high dependency entries. The high cascade originates in the node-forge signature-verification advisory through Expo CLI/code-signing tooling (also reported through Expo and DateTimePicker). No incompatible forced Expo downgrade or arbitrary override was applied. This is a dependency/tooling review item before release, separate from the tested local App Lock flows. No PIN, salt/verifier, secrets or SecureStore contents are logged. No database reset/migration, Supabase schema/transport change, reminder scheduler change or next-phase work was introduced.
