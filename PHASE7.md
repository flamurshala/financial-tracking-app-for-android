# Phase 7 · App privacy and management

## Files and architecture

Added `types/security.ts`, `services/security/appLockController.ts`, `services/appLock.ts`, `components/security/AppLockGate.tsx`, `components/security/SecuritySettings.tsx`, `services/preferences.ts`, `components/PreferencesLifecycle.tsx`, `app/categories/index.tsx`, `components/finance/CategoryManagerForm.tsx`, and `constants/categoryProtection.ts`. Added lifecycle, gate, native-adapter and management regression tests.

Modified the root layout, Settings, Accounts/account detail, account/category/shared repositories, LocalAuthentication wrapper, Expo config, dependency lockfile and documentation. No financial schema migration, database reset, deletion, authentication transport or sync-engine change was needed.

A process-local controller owns readiness, lock state, authenticated startup status, in-flight authentication and foreground/background transitions. SecureStore is loaded before protected routes, SQLite and cloud lifecycle components mount. Every cold start with the setting enabled is locked. The root gate covers all routes and deep links; after first unlock, existing screens remain mounted but hidden, inaccessible to touch and accessibility, and covered by a full-screen native modal while locked/inactive. Android back cannot dismiss that modal. No navigation redirects or Supabase credentials participate in unlocking.

Lock delay choices are Immediately / 1 / 5 / 15 minutes, default one minute. The controller records the background timestamp and checks elapsed time on foreground; no background interval timer is used. Clock rollback locks conservatively. The system biometric prompt's inactive transition is distinct from actual backgrounding; pending authentication is invalidated when the app actually backgrounds. Rapid taps launch only one prompt.

## Authentication, storage and limitations

Enabling requires available/enrolled biometrics and a successful biometric-only prompt. Hardware, enrollment and fingerprint/face/iris capabilities are checked. Unlock, disabling, and changing an enabled timeout use Expo LocalAuthentication with the operating system's device-passcode fallback. Failed/canceled/temporarily unavailable authentication remains locked or leaves settings unchanged. Native failures produce user-facing messages rather than a render crash.

Custom application PIN fallback was deliberately omitted. Expo Crypto in this app does not expose a password KDF; a fast digest of a 4–6 digit PIN is inadequate. A separate verifier/KDF/retry subsystem was not introduced; the OS passcode fallback delegates credential handling and retry protection to the device. No app PIN, PIN verifier or salt is stored anywhere.

The enabled flag and timeout form one atomic, device-local SecureStore policy (`finance.app-lock.v1`, accessible only while the device is unlocked and not migrated through iOS keychain backups). Keeping these two security policy fields together avoids partial writes and downgrade races. Malformed/unreadable policy fails closed with Retry; absent policy defaults OFF. Financial data stays in SQLite and theme preferences use existing SQLite metadata, not SecureStore. Supabase sign-out does not remove the separate App Lock key. Changing phone requires configuring its own security settings.

App Lock protects normal UI access; it does not encrypt SQLite or protect a rooted/jailbroken device, extracted database or compromised OS. Do not uninstall/reset the app to troubleshoot lock/storage problems; local data may be lost. Enable a device screen lock and keep recoverable cloud copies as appropriate.

Added SDK-compatible `expo-screen-capture` (~57.0.3). While App Lock is enabled, capture protection is enabled before exposing unlocked routes; Android FLAG_SECURE also masks recents thumbnails, and supported iOS app-switcher protection applies an inactive-state privacy blur. Privacy operations are serialized. A visible notice reports native protection failures; the route lock remains active. No screenshot-detection permissions or native hacks were added. Platform limitations still require physical-device checks. Sources: [Expo ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/) and [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/).

## Settings and management

Settings now has General, Notifications, Categories, Accounts, Cloud Sync, Security, Data and About sections. Currency is read-only EUR, dates remain local YYYY-MM-DD internally, and System/Light/Dark theme persists in SQLite. Reminder controls, permission/status, test notification (development only), sign-in/out, sync status/last sync and Sync Now remain. The reminder time picker now uses its current non-deprecated events. Export is explicitly shown as planned, not offered as a working action. App/database versions are displayed; native capabilities and sync diagnostics stay development-only.

Categories show expense/income sections (Both categories appear in each), built-in/custom status and archives. Create, rename/edit custom categories, archive and restore retain IDs and references, set pending sync, and trigger the existing revision/sync mechanism. Built-in names are fixed in this management UI, while the existing repository update contract stays compatible with prior sync behavior. Other's stable built-in ID cannot be locally archived. Groceries keeps its existing seed name; earlier persisted user edits are not reset.

Accounts show type/balance/archive status and can be created, edited, adjusted, archived or restored. Archiving the last active account gives an explicit warning that entry stops until an account is created/restored. The repository's existing archive contract is retained. Historical transactions and balances remain intact. Restore marks the row pending for sync.

## Notification and sync interaction

The existing reminder payload does not perform an Add Transaction redirect. A notification tap opens the application/current route; the root lock applies before any protected UI. No new notification routing or scheduler behavior was introduced. Scheduling and delivery remain native OS responsibilities, independent of offline biometric unlock. If a deep link targets any finance route, it remains behind the same root gate.

Cloud session restoration/sync mounts after the first unlock and continues its existing lifecycle after that. Financial writes remain SQLite-first. No credentials, owner rules, schema, conflict behavior or transport were changed. Tests exercise the existing sync engine with fake transport and the actual SQL/RLS in embedded PostgreSQL; they do not prove live Supabase connectivity. Local unlock makes no network calls.

## Validation and device checklist

All 60 tests pass, strict TypeScript/ESLint and Expo dependency checks pass, and Android production bundle export passes. Regression coverage includes startup privacy, canceled/failed enable/unlock/disable, timeout boundaries, rapid prompts, async/background races, corrupt SecureStore, secure setting persistence, no app PIN data, route masking, offline dependency separation, category/archive/restore, theme persistence, existing financial totals, nightly schedule reconciliation, sync/archive/restore and PostgreSQL ownership rules. Native APIs are mocked in automated tests; gate tests inspect rendered React elements rather than Android window behavior.

On a physical Android device/development build:

1. Enroll a fingerprint/face and device passcode. Enable App Lock: cancel first (must remain OFF), then succeed. Try a device without enrollment/hardware and confirm clear messaging.
2. Force-close/reopen: no dashboard flash before Unlock. Fail/cancel unlock, then succeed. Try offline. Switch between finance screens without repeated prompts.
3. With one-minute delay, background for 20 seconds (no lock) and at least one minute (lock). Test Immediately, 5 and 15 minutes, biometric prompt interruptions, Android back, recents thumbnail and screenshots.
4. Disable App Lock and change timeout: cancel authentication and verify no change, then succeed. Sign out of Supabase and restart: App Lock stays enabled. Changing biometrics/device credentials should retain a supported system fallback; verify on your device.
5. Schedule the nightly reminder, test foreground/background delivery, tap it while cold/locked, and confirm lock appears before finance screens. Android Expo Go intentionally reports reminders unavailable; use a development build for notification delivery. No Add Transaction redirect is currently configured.
6. Test System/Light/Dark across restart and large-font/narrow layouts. Create Expense/Income/Both custom categories, rename one with history, archive/restore it, and verify selections/reports/history plus sync. Other must remain available.
7. Archive/restore an account with history; confirm balance unchanged and last-active warning. Verify offline writes and later Sync Now against your configured Supabase project without duplicates or missing data.
8. Future iOS: rebuild after the Face ID permission text/config change. Face ID cannot be validated in Expo Go; test Face ID/Touch ID, passcode fallback and app-switcher blur on physical hardware.

No next-phase work was started.

The attempted Expo Go emulator startup did not reach this JavaScript application; its native loader failed while loading the project. Native runtime acceptance remains unverified. See VALIDATION.md for the test boundary and current dependency audit follow-up.
