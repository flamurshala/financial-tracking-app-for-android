# Personal finance · Phase 4

A personal Android-first finance app with a shared React Native codebase for future iOS release. Daily transaction entry, searchable history, editing/deletion, account management, auditable balance adjustments and the Home dashboard now use the existing local database. SQLite remains authoritative. Day/week/month/year/custom statistics, category drilldowns and combined transaction filters are implemented. Synchronization, authentication, reminders, biometric locking and exports remain for future phases.

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
8. Follow PHASE4.md for report/filter checks. Cloud login, reminders and locking are not implemented yet.

No permissions are requested on startup. Financial records remain in SQLite; no record cache is duplicated in Zustand. The local SQLite file uses the application's storage sandbox and is not encrypted; SecureStore is reserved for session/security values.

