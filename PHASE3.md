# Daily-use functionality · Phase 3

## Implemented screens

- **Home:** combined balance, compact account balances (archives labeled), this-month/today income/expenses/net, five recent transactions and prominent Add Transaction action.
- **Add Transaction:** expense/income switch, prominent decimal amount, required free-form description, quick category chips, More Categories, inline custom category creation, recent description suggestions, account choice, native date picker with Today/Yesterday shortcuts, Save and Save & Add Another.
- **Transactions:** virtualized history grouped by financial date, positive/negative amounts, debounced description search and 50-record pages. Duplicate category/description labels are suppressed.
- **Transaction details:** editable amount/description/category/account/date/type and deletion with confirmation. Soft deletion immediately affects calculated balances. Adjustments retain their special flag when edited.
- **Accounts:** create, view current/opening balance, edit, archive with explanation and show archived accounts. Archived balances remain included in owned funds and history.
- **Adjust Balance:** actual balance input, difference preview, date choice and confirmation. Saving re-reads the balance under `BEGIN IMMEDIATE`, then records a special positive or negative correction. No history or opening balance is silently rewritten.

The Statistics tab remains a placeholder for the next phase. No sync, notification scheduling, authentication or biometric lock was added.

## Components and data flow

Reusable TransactionForm, AccountForm, NewCategoryForm, DateField, TransactionRow, PeriodSummary, ChoicePicker/Chip, QueryState and Notice components support both themes, inline validation and accessible controls. Screen handles scrolling/keyboard avoidance. Validation uses React Hook Form and Zod, with exact decimal-string-to-cent conversion.

`saveEntry` saves locally and remembers the account in SQLite in one transaction. With one active account it is selected automatically; otherwise the last valid active account is preferred. Save & Add Another clears amount/description/category, keeps type/date/account and focuses amount. Saving and deletion have duplicate-submit guards; committed writes trigger focused queries instead of maintaining an independent Zustand financial dataset.

Groceries is the visible default for ordinary supermarket/store and household shopping, including what was previously called “hargj”. Food, Lunch and Dinner remain separate. Other permits any free-form description, including “Engagement makeup”. Custom category type follows the entry type selected when it is created.

Only one new runtime dependency was added: the Expo-compatible [community native date picker](https://docs.expo.dev/versions/latest/sdk/date-time-picker/). No database migration was needed; versions 1–3 and existing user data remain intact. New local service workflows and read repositories reuse those tables.

## Automated verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npx expo install --check`, and `npx expo export --platform android`. Tests cover the exact daily balance scenario, correction signs/zero correction, archived references, save/preference atomicity, Unicode search, date preservation, form validation/reset behavior, pagination and database close/reopen persistence. These are business/data tests, not simulated native UI taps.

## Manual Android checklist

Start an emulator or connect a physical phone, then run `npm run android` (or `npm start` and scan the QR code with a compatible Expo Go version). Use a test account; retain your previous install to test upgrades rather than clearing its database.

1. Create **Cash** with initial balance **500**. Confirm Home and Accounts show **€500.00**.
2. Add Coffee expense **1**, description Coffee. Use **Save & Add Another**: expect **€499**, blank amount/description/category, same date/account/type, focus on amount and subtle saved feedback.
3. Add Lunch expense **6** → **€493**; Fuel expense **30** → **€463**. Select Income and Client Payment **50** → **€513**. Confirm positive income appears in history and dashboard summaries.
4. Open Fuel, Edit, change **30** to **35** → **€508**. Confirm the description/date/account/category remain correct.
5. Open Coffee and Delete. Cancel once to verify it remains, then confirm deletion → **€509**. It should disappear from ordinary history and totals.
6. Cash → Adjust Balance → Actual **500**. Preview **−€9**, confirm, then expect **€500** and a visible **Balance Adjustment −€9.00** history entry. Initial balance remains €500. Repeat actual 500: no zero-valued record. Try actual 505 to verify a positive correction.
7. Pick Yesterday for a new entry and verify it groups under yesterday. Change device timezone, restart and verify the financial date stays the same. Confirm cancelling the Android picker does not alter it; check iOS picker in a future iOS build.
8. Add descriptions `30 naft benzit`, `darka me elonen`, `Spotify`, and text containing Albanian `ë`. Search `naft`, `elona`, `spotify` and mixed-case Albanian text. Clear search and check pagination after more than 50 records.
9. Select Groceries for a supermarket purchase. Select Other and enter `Engagement makeup`. Create a custom category, save, restart and confirm it is selectable. Tap a recent description suggestion and confirm it fills text without saving.
10. Create Bank and Card. Save an entry with Bank, restart and confirm Bank is the default next time. Archive Bank: it should be unavailable for new entries but remain in combined balance/history; archived-account details must show that state.
11. Try empty/zero/negative/malformed/too-large transaction amounts, blank descriptions and missing category/account. Confirm inline errors and no saved row. Decimal comma and dot should both work; thousands separators are intentionally rejected.
12. Force-close/reopen and repeat entry in airplane mode without Supabase credentials. Confirm balances, entries, custom categories and last-account preference persist. Test rapid double taps, Android back during saving, keyboard visibility, large system fonts and light/dark modes.

## Current limitations

Native launch, taps, keyboard/focus behavior and platform picker behavior could not be verified here because no Android device/emulator was available. File-backed SQLite restart and all listed business workflows were tested locally. Currency is EUR; search's small name-inflection aid does not cover every Albanian grammatical form, and search scans descriptions for Unicode matching. Archived accounts can be viewed/edited but no restore action is included in this phase. The app is local-only; cloud backup and advanced statistics are still pending.
