# Finance foundation · Phase 1

A personal Android-first finance app with a shared React Native codebase for future iOS release. This phase provides navigation, UI components, local database infrastructure and service boundaries. It does not implement financial records, calculations, synchronization, authentication, reminders, biometric locking or exports.

## Stack

Expo SDK 57, React Native, strict TypeScript, Expo Router, Expo SQLite, Supabase, Zustand, React Hook Form, Zod/resolvers, SecureStore, LocalAuthentication, Notifications and date-fns. Native dependencies use Expo-compatible versions. The package lock records installed versions.

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

- `app/`: five tab routes, cloud account placeholder, add and edit transaction routes.
- `components/ui/`, `components/finance/`: reusable presentation components.
- `constants/`, `hooks/`, `types/`, `utils/`: theme, currency, typed form pattern, calendar-date utilities and safe diagnostics.
- `database/`: initialization, ordered migrations, schema types and parameterized repositories.
- `services/`: Supabase, secure session storage, future sync boundary, permission inspection and biometric capability inspection.
- `store/`: separate auth, finance UI and settings stores. Financial records belong in SQLite, not Zustand.
- `assets/`: Expo template icons; replace with final branding later.
- `tests/`: meaningful SQLite migration and date regression checks using Node's SQLite adapter.

## Local database architecture

`SQLiteProvider` opens `finance.db` and awaits initialization before rendering routes. WAL and foreign keys are enabled. An exclusive transaction creates the migration ledger and applies pending numbered migrations atomically. Version 1 only creates an app metadata table. No finance schema exists yet. Append migrations with sequential versions; do not modify shipped migrations or delete user databases. SQL identifiers/statements are trusted code; all external values use bound parameters. Unexpected newer schemas fail safely. Startup errors reach the app error boundary and allow retry without deleting data.

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

Foundation only; proceed to Phase 2 after the device checks below. Android bundle export verifies compilation, but does not prove native runtime behavior. Tests use real desktop SQLite through an Expo-shaped adapter; they do not replace testing Expo SQLite on Android. See `VALIDATION.md` for this session's results and limitations.

## Manual checks before Phase 2

1. Launch on emulator and physical Android. Home should appear after database initialization, with no error screen.
2. Visit all five tabs; open Add transaction, return with Android back, and open Cloud account from Settings.
3. Open `finance://transaction/example-id` to verify the edit route in an installed build with the custom scheme (Expo Go uses its own development URL).
4. Force-close and reopen. Confirm the database remains available; repeat startup in airplane mode with no Supabase variables.
5. Check device/light/dark appearance, large system font sizes, narrow screen layouts, keyboard dismissal when future forms arrive, and Android back behavior.
6. Do not expect saving records, cloud login, reminders or locking to work yet.

No permissions are requested on startup. No sensitive financial values are placed in Zustand or insecure persistence. The local SQLite file is not encrypted; future sensitive-data and app-lock requirements must be decided before financial data storage is implemented.
