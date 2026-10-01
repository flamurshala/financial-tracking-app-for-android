# Personal finance · Phase 5

A personal Android-first finance app with a shared React Native codebase for future iOS release. Daily transaction entry, searchable history, editing/deletion, account management, auditable balance adjustments and the Home dashboard now use the existing local database. SQLite remains authoritative. Day/week/month/year/custom statistics, category drilldowns and combined transaction filters are implemented. Local daily reminders are implemented. Synchronization, authentication, biometric locking and exports remain for future phases.

## Stack

Expo SDK 57, React Native, strict TypeScript, Expo Router, Expo SQLite, Supabase, Zustand, React Hook Form, Zod/resolvers, SecureStore, LocalAuthentication, Notifications and date-fns. Expo Crypto supplies native UUID generation; the community DateTimePicker supplies native Android/iOS date selection. Native dependencies use Expo-compatible versions. The package lock records installed versions.

## Prerequisites and installation

Install Node.js 24 LTS with npm on Windows. Install Android Studio, its Android SDK/platform tools and an Android Virtual Device for emulator testing. Enable hardware virtualization. iOS simulator/build development requires macOS or a hosted build service.

```powershell
cd "C:\Users\Flamur Shala\Desktop\financial tracking app"
npm install
Copy-Item .env.example .env
npm start
```

The environment file is optional for local startup. Configure only public client values when cloud features are needed:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Never put service-role keys in the application. Expo public variables are bundled and visible to clients. `.env` and its variants are ignored; `.env.example` contains no credentials. The lazy client lives in `services/supabase.ts`, with a chunked SecureStore session adapter. Future authentication must also wire session changes and foreground/background token refresh lifecycle.

## Run on Android

Start an Android Studio emulator through Device Manager, wait for its home screen, then run:

```powershell
npm run android
```

Ensure `ANDROID_HOME` points at the SDK (typically `%LOCALAPPDATA%\Android\Sdk`) and `platform-tools` is on PATH. Expo opens the app in a compatible Expo Go installation. For a physical Android phone, install Expo Go compatible with SDK 57, connect to the same network as the computer, run `npm start`, and scan the QR code. If Expo Go does not support the SDK available on your phone, use a compatible version from Expo's official download page or an Expo development build. Biometric and notification behavior requires device/development-build verification when those features are implemented.

## Structure

- `app/`: Home dashboard, Transactions history/search, Accounts management, transaction details/entry and account detail/create/adjust routes. Statistics includes reports and category detail routes; cloud-account functionality remains a placeholder.
- `components/ui/`, `components/finance/`: reusable presentation components.
- `constants/`, `hooks/`, `types/`, `utils/`: theme, currency, typed form pattern, calendar-date utilities and safe diagnostics.
- `database/`: initialization, ordered migrations, schema types and parameterized repositories.
- `services/`: local finance workflows and dashboard snapshots, Supabase, secure session storage, future sync boundary, permission inspection and biometric capability inspection.
- `store/`: separate auth, finance UI and settings stores. Financial records belong in SQLite, not Zustand.
- `assets/`: Expo template icons; replace with final branding later.
- `tests/`: meaningful SQLite migration and date regression checks using Node's SQLite adapter.

## Local database architecture

`SQLiteProvider` opens `finance.db` and awaits initialization before rendering routes. WAL and foreign keys are enabled. An exclusive transaction creates the migration ledger and applies pending numbered migrations atomically. Version 1 remains unchanged; version 2 adds finance tables and indexes; version 3 seeds categories; version 4 adds reporting/search support. Append migrations with sequential versions; do not modify shipped migrations, seed order or delete user databases. SQL identifiers/statements are trusted code; all external values use bound parameters. Unexpected newer schemas fail safely. Startup errors reach the app error boundary and allow retry without deleting data. See [DATABASE.md](DATABASE.md) for the schema, API and manual repository checks.

UI → local repositories → future sync service → Supabase is the intended data flow. Supabase credentials and network access are not needed to open the local app. Sync currently reports `not-configured` and performs no network writes.

Amounts use EUR configuration and integer minor units. Calendar dates remain validated `YYYY-MM-DD` strings; timestamps are reserved for events such as migration application. Do not use UTC conversions for transaction calendar dates. Appearance follows the device by default; light/dark choices are session-only for now. `useValidatedForm` demonstrates Zod plus React Hook Form for schemas without transforms/coercion; forms that transform input should explicitly specify their input and output types.

## Checks and current status

```powershell
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform android
```

Phase 4 reporting and filtering functionality is implemented. Android bundle export verifies compilation, but does not prove native runtime behavior. Tests use real file-backed desktop SQLite through an Expo-shaped adapter, substitute native UUID generation with Node Crypto, and close/reopen the database for persistence checks. They do not replace testing Expo SQLite and UI interactions on Android. See `VALIDATION.md`, [PHASE4.md](PHASE4.md) and [PHASE3.md](PHASE3.md) for results and the device checklist.

## Manual checks before the next phase

1. Launch on emulator and physical Android. Home should appear after database initialization, with no error screen.
2. Visit all five tabs; open Add transaction, return with Android back, and open Cloud account from Settings.
3. Tap a saved transaction in history and verify its details and Edit action. For deep-link testing in an installed build, use `finance://transaction/<actual-record-UUID>` (Expo Go uses its own development URL).
4. Force-close and reopen. Confirm the database remains available; repeat startup in airplane mode with no Supabase variables.
5. Check device/light/dark appearance, large system font sizes, narrow screen layouts, keyboard dismissal when future forms arrive, and Android back behavior.
6. Verify the database has migration versions 1–4 and exactly 25 default categories. Restart without reinstalling; confirm no duplicate categories and existing records/metadata remain.
7. Follow the complete UI workflow in `PHASE3.md`: transaction entry, Save & Add Another, account creation/edit/archive, confirmed deletion, balance adjustment, search and restart persistence.
8. Follow PHASE4.md for report/filter checks. Cloud login and locking are not implemented yet. See the Phase 5 reminder checklist below.

No notification permission prompt is shown on startup; reminder Settings requests it on first appropriate use. Financial records remain in SQLite; no record cache is duplicated in Zustand. The local SQLite file uses the application's storage sandbox and is not encrypted; SecureStore is reserved for session/security values.


## Phase 5: offline daily finance reminder

Settings → Finance Reminder defaults to ON at **22:00 local device time**. The switch records your preference; Permission and Status separately report OS authorization and the verified pending schedule. First opening this section requests permission only when the OS reports `undetermined` and allows asking. Denials do not trigger repeated prompts. Open Settings uses React Native's supported `Linking.openSettings()` to open app system settings (in Expo Go these belong to Expo Go). Check both app notification permission and the Finance Reminders channel. Returning to the app refreshes permission and reconciles the schedule.

`services/notifications.ts` owns channel creation, permission, scheduling, cancellation and development test delivery. `components/ReminderLifecycle.tsx` reconciles once after SQLite initialization and whenever the app returns to the foreground. `store/settingsStore.ts` holds UI status; `database/repositories/reminderRepository.ts` persists `reminder_enabled`, `reminder_hour`, and `reminder_minute` atomically in the existing `app_metadata` table. No new storage dependency, database migration, cloud service, token registration or background worker is needed.

Duplicate prevention: a single service promise queue serializes startup, foreground refresh and settings changes. Scheduled requests are identified by the stable `daily-finance-reminder` identifier or the same `content.data.kind` marker. An already correct single request is retained. Otherwise all matching requests are canceled, exactly one daily request is scheduled, and the pending list is read again to verify the time and count. OFF or missing permission cancels matching requests and verifies zero. Other notifications are preserved. Saved preferences remain available when scheduling fails; Settings shows Error and provides a refresh/retry action. The development count is read from Expo's pending list, not calculated from preferences. No estimated next-delivery time is displayed.

Android channel: `finance-reminders`, name `Finance Reminders`, DEFAULT importance, standard sound and no custom vibration. The existing `expo-notifications` config plugin is retained. No exact-alarm permission is added: approximate daily delivery is appropriate here. Foreground presentation uses the current `shouldShowBanner`/`shouldShowList` handler fields, without foreground sound or badges. Android channel settings remain under the user's control.

Scheduling uses Expo's DAILY trigger with hour/minute, not an 86,400-second interval or fixed UTC timestamp. The installed SDK maps this to a repeating calendar trigger on iOS. It follows normal native timezone/DST behavior; test travel/timezone changes on the target device, particularly while the app remains closed. Android's installed Expo scheduler uses an inexact idle-capable alarm when exact alarms are unavailable, so delivery can be delayed by Doze/battery restrictions. The library includes its own BOOT_COMPLETED receiver and restores saved requests after reboot; no custom reboot service is added. Reboot delivery has not been tested on hardware here. Android force-stop may prevent alarms until the app is opened again. A pending schedule confirms registration, not guaranteed delivery. Conditional transaction-based reminders are deliberately deferred.

Notification taps open the app normally. Use Home → Add Transaction. No new deep-link observer is installed. All existing transaction, account, balance, filtering and statistics workflows remain intact.

### Expo Go and physical Android checklist

[Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) explicitly supports local notifications in Expo Go. Remote push on Android requires a development build but is not used here. These local notification APIs do not require a development build. Use an SDK-57-compatible Expo Go. For independent app permissions, native plugin configuration and reboot/release acceptance, test an installed app build as well; Expo Go shares its host application's permissions and native configuration.

1. From this project's directory run `npm install` if dependencies are missing, then `npm start` (or `npx expo start --go`). Install SDK-57-compatible Expo Go on the physical phone, connect it to the computer's network and scan the QR code. No Supabase environment variables are needed. Network is only needed to load the development bundle; scheduled reminders do not require internet.
2. Open Settings → Finance Reminder and allow notifications. Expect ON, 22:00, Permission granted, Status Scheduled, and **Developer: verified daily schedules: 1**. In a separate fresh install/data reset test, deny permission: expect Permission Required, count 0, no crash and an explanation. Do not erase your existing finance data to simulate a fresh install; use a separate test installation.
3. Press **Send Test Notification**. Within about three seconds expect `Finance Reminder Test` / `Notifications are working correctly.` Try with the app foreground and background/phone locked. The button and count are development-only. A successful scheduling confirmation does not itself prove delivery.
4. Tap Reminder Time and choose any time 2–3 minutes ahead using the native time picker. Expect the new HH:mm, Scheduled and count 1. Background the app and wait. Repeat with a different future time; verify no alert arrives at the previous time. Use Refresh reminder status to query the real pending list again.
5. Switch OFF: expect Disabled and count 0; confirm no daily alert at the former time. Switch ON: expect one schedule at the saved time. Close/reopen repeatedly and press Refresh: count must remain 1. Time and switch must persist after restart.
6. Tap a daily notification and confirm the app opens, then use Home → Add Transaction. Check an existing account balance, create an income/expense, inspect history/filter/statistics and verify existing finance behavior.
7. For hardware reboot acceptance, set a future time, reboot the installed app's phone and wait after unlocking. Test airplane mode, device timezone changes and normal battery optimization. Record device/Android version, permission/channel settings and actual arrival time. Restore 22:00 when finished.
8. For an independent installed native build with Android SDK/JDK configured and the physical phone connected over USB with USB debugging enabled, run `npx expo run:android --device`. This creates the native project and installs a debug app. For accurate release-launch testing use `npx expo run:android --device --variant release`. Native build acceptance is recommended even though the local APIs work in Expo Go; the test button is hidden in release builds.

Automated coverage: `tests/reminder.test.cjs` mocks native notifications while using the real service and file-backed SQLite. It covers permission granted/denied, ten concurrent startup reconciliations, duplicate cleanup, time change, OFF/ON, database reopen, scheduling failure/recovery and the three-second test request. These tests do not prove native notification delivery. Physical-device, reboot and future iOS runtime tests remain manual.

