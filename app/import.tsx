import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Switch } from "react-native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Screen, Card, SectionTitle, Body, Button } from "../components/ui";
import { ChoicePicker } from "../components/ui/Choice";
import { useLocalQuery } from "../hooks/useLocalQuery";
import { getAccounts } from "../database/repositories/accountRepository";
import {
  previousImport,
  previewImport,
  commitImport,
  DuplicateImportError,
} from "../database/repositories/importRepository";
import { chooseImportCsv } from "../services/csvImport";
import { shareImportTemplate } from "../services/exports";
import { appLock } from "../services/appLock";
import { csvNameKey } from "../utils/csvImport";
import { formatAmount } from "../utils/currency";
import type {
  CsvImportBatch,
  CsvImportPreview,
  CsvAccountMapping,
} from "../types/csvImport";
import { useFinanceStore } from "../store/financeStore";
type Selection = NonNullable<Awaited<ReturnType<typeof chooseImportCsv>>>;
export default function ImportScreen() {
  const db = useSQLiteContext();
  const accounts = useLocalQuery(useCallback(() => getAccounts(db), [db]));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [mappings, setMappings] = useState<CsvAccountMapping>({});
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [previous, setPrevious] = useState<CsvImportBatch | null>(null);
  const [createCategories, setCreateCategories] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState<Awaited<
    ReturnType<typeof commitImport>
  > | null>(null);
  const [errorPage, setErrorPage] = useState(1);
  const alive = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const check = () => {
    const lock = appLock.getSnapshot();
    if (
      !alive.current ||
      AppState.currentState !== "active" ||
      !lock.ready ||
      lock.locked ||
      lock.backgrounded
    )
      throw new Error("Import interrupted. Unlock the app and retry.");
  };
  const refresh = async (file: Selection, map: CsvAccountMapping) => {
    const next = await previewImport(db, file.rows, map);
    const old = await previousImport(db, file.hash);
    check();
    setPreview(next);
    setPrevious(old);
    setErrorPage(1);
  };
  const choose = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const file = await chooseImportCsv();
      if (!file || !alive.current) return;
      check();
      setSelection(null);
      setPreview(null);
      setMappings({});
      setCreateCategories(false);
      setComplete(null);
      await refresh(file, {});
      setSelection(file);
    } catch (cause) {
      if (alive.current) {
        setSelection(null);
        setPreview(null);
        setPrevious(null);
        setError(
          cause instanceof Error &&
            /^(Choose a|The CSV|Missing |Record |Malformed CSV|Import at most|Use a |Use the six|Unable to read|Import interrupted)/.test(
              cause.message,
            )
            ? cause.message
            : "Unable to prepare the CSV. Use the six-column UTF-8 template, a file up to 5 MB and at most 10,000 rows. Check dates, quoting and account/category names.",
        );
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const mapAccount = async (name: string, id: string) => {
    if (!selection || running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setCreateCategories(false);
    const next = { ...mappings, [csvNameKey(name)]: id };
    try {
      await refresh(selection, next);
      setMappings(next);
    } catch {
      if (alive.current) {
        setPreview(null);
        setError("Unable to refresh preview. Choose the file again.");
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const perform = async (allowDuplicate: boolean) => {
    if (!selection || !preview || running.current) return;
    running.current = true;
    setBusy(true);
    setProcessed(0);
    setError(null);
    try {
      check();
      const result = await commitImport(
        db,
        {
          raw: selection.rows,
          mappings: { ...mappings },
          preview,
          fileName: selection.fileName,
          hash: selection.hash,
          createCategories,
          allowDuplicate,
        },
        (count) => {
          if (alive.current) setProcessed(count);
        },
        check,
      );
      useFinanceStore
        .getState()
        .invalidate(`Imported ${result.batch.row_count} transactions.`);
      if (alive.current) {
        setComplete(result);
        setPreview(null);
        setSelection(null);
      }
    } catch (cause) {
      if (alive.current) {
        if (cause instanceof DuplicateImportError) {
          try {
            const batch = await previousImport(db, selection.hash);
            if (alive.current) {
              setPrevious(batch);
              setError(cause.message);
            }
          } catch {
            if (alive.current) {
              setPreview(null);
              setError(
                "Unable to refresh import history. Choose the file again.",
              );
            }
          }
        } else {
          setError(
            cause instanceof Error &&
              /^(Import interrupted|Accounts or categories changed|Approve the new categories|There are no valid)/.test(
                cause.message,
              )
              ? cause.message
              : "Unable to import. No part of this import was committed. Refresh the preview and retry.",
          );
          setPreview(null);
        }
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const confirm = () => {
    if (!preview || !selection) return;
    const invalid = new Set(preview.errors.map((row) => row.rowNumber)).size;
    Alert.alert(
      previous ? "Previously imported file" : "Confirm CSV import",
      `${previous ? `This content was imported on ${new Date(previous.imported_at).toLocaleString()}. Importing again will add another copy.\n\n` : ""}Import ${preview.rows.length} transactions? ${invalid} invalid rows will be skipped. ${preview.unknownCategories.length} approved new categories will be created. Account initial balances will not change.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: previous
            ? "Import Anyway"
            : invalid
              ? "Import Valid Rows"
              : "Import",
          onPress: () => {
            void perform(Boolean(previous));
          },
        },
      ],
    );
  };
  const invalid = preview
    ? new Set(preview.errors.map((row) => row.rowNumber)).size
    : 0;
  return (
    <Screen>
      <SectionTitle>Import Transactions</SectionTitle>
      <Card>
        <Body>
          CSV format: Date (YYYY-MM-DD), Type (Expense/Income), Amount (decimal
          EUR), Description (optional), Category, Account. Headers are
          case-insensitive and can appear in any order.
        </Body>
        <Body>
          Template account names are examples. Use your existing accounts or map
          unknown names below. Importing adds transactions to your current
          initial balances; it never recalculates them. Ordinary import does not
          support adjustments or the extra export/backup columns.
        </Body>
        <Button
          secondary
          title="Download CSV Template"
          disabled={busy}
          onPress={() => {
            if (running.current) return;
            running.current = true;
            setBusy(true);
            void shareImportTemplate(() => !alive.current)
              .catch(() => {
                if (alive.current)
                  setError(
                    "Unable to share the template. Unlock the app and try again.",
                  );
              })
              .finally(() => {
                running.current = false;
                if (alive.current) setBusy(false);
              });
          }}
        />
        <Button
          title={busy ? `Preparing (${processed} rows)…` : "Import CSV"}
          disabled={busy}
          onPress={() => {
            void choose();
          }}
        />
        {error ? <Body>{error}</Body> : null}
      </Card>
      {selection ? (
        <Card>
          <Body>Selected: {selection.fileName}</Body>
          <Button
            secondary
            title="Refresh preview"
            disabled={busy}
            onPress={() => {
              if (running.current) return;
              running.current = true;
              setBusy(true);
              setCreateCategories(false);
              void refresh(selection, mappings)
                .catch(() => {
                  if (alive.current)
                    setError("Unable to refresh. Choose the file again.");
                })
                .finally(() => {
                  running.current = false;
                  if (alive.current) setBusy(false);
                });
            }}
          />
        </Card>
      ) : null}
      {preview ? (
        <>
          <Card>
            <SectionTitle>Import Preview</SectionTitle>
            <Body>
              Valid rows: {preview.rows.length} · Invalid rows: {invalid}
            </Body>
            <Body>Expenses: {formatAmount(preview.expenseCents)}</Body>
            <Body>Income: {formatAmount(preview.incomeCents)}</Body>
            <Body>
              Accounts found:{" "}
              {[...new Set(preview.rows.map((row) => row.accountName))].join(
                ", ",
              ) || "None"}
            </Body>
            <Body>
              Categories found:{" "}
              {[...new Set(preview.rows.map((row) => row.categoryName))]
                .slice(0, 50)
                .join(", ") || "None"}
            </Body>
            {previous ? (
              <Body>
                This content was previously imported on{" "}
                {new Date(previous.imported_at).toLocaleString()}. Import Anyway
                will deliberately duplicate its valid rows.
              </Body>
            ) : null}
            {preview.rows.slice(0, 5).map((row) => (
              <Body key={row.rowNumber}>
                Row {row.rowNumber}: {row.input.transaction_date} ·{" "}
                {row.input.type} · {formatAmount(row.input.amount_cents)} ·{" "}
                {row.input.description} · {row.accountName}
              </Body>
            ))}
          </Card>
          {preview.unknownAccounts.length ? (
            <Card>
              <SectionTitle>Map unknown accounts</SectionTitle>
              <Body>
                No accounts are created automatically. Map each name to an
                active account, or cancel and create/configure an account first,
                then choose the CSV again.
              </Body>
              {preview.unknownAccounts.slice(0, 50).map((name) => (
                <ChoicePicker
                  key={name}
                  label={`CSV account: ${name}`}
                  value={mappings[csvNameKey(name)] ?? ""}
                  disabled={busy}
                  onChange={(id) => {
                    void mapAccount(name, id);
                  }}
                  options={[
                    { value: "", label: "Choose an existing account" },
                    ...(accounts.data ?? []).map((account) => ({
                      value: account.id,
                      label: `${account.name} (${account.type})`,
                    })),
                  ]}
                />
              ))}
              {preview.unknownAccounts.length > 50 ? (
                <Body>
                  More than 50 unknown account names. Correct names in the CSV
                  before importing.
                </Body>
              ) : null}
            </Card>
          ) : null}
          {preview.unknownCategories.length ? (
            <Card>
              <SectionTitle>Unknown categories</SectionTitle>
              <Body>
                {preview.unknownCategories
                  .slice(0, 100)
                  .map((category) => `${category.name} (${category.type})`)
                  .join(", ")}
              </Body>
              {preview.unknownCategories.length > 100 ? (
                <Body>
                  More than 100 new categories. Correct names or split the file
                  before importing.
                </Body>
              ) : (
                <>
                  <Body>Create these custom categories with this import?</Body>
                  <Switch
                    accessibilityLabel="Approve creation of all listed unknown categories"
                    value={createCategories}
                    disabled={busy}
                    onValueChange={setCreateCategories}
                  />
                </>
              )}
            </Card>
          ) : null}
          {preview.errors.length ? (
            <Card>
              <SectionTitle>Review Errors</SectionTitle>
              {preview.errors.slice(0, errorPage * 25).map((row, index) => (
                <Body key={`${row.rowNumber}-${row.field}-${index}`}>
                  Row {row.rowNumber} · {row.field}: {row.problem}
                </Body>
              ))}
              {preview.errors.length > errorPage * 25 ? (
                <Button
                  secondary
                  title="Show more errors"
                  onPress={() => setErrorPage((value) => value + 1)}
                />
              ) : null}
              <Body>
                Invalid rows will be skipped only after you explicitly confirm.
              </Body>
            </Card>
          ) : null}
          <Button
            title={`Import ${preview.rows.length} Transactions`}
            disabled={
              busy ||
              !preview.rows.length ||
              preview.unknownCategories.length > 100 ||
              (preview.unknownCategories.length > 0 && !createCategories)
            }
            onPress={confirm}
          />
          <Button
            secondary
            title="Cancel preview"
            disabled={busy}
            onPress={() => {
              setSelection(null);
              setPreview(null);
              setPrevious(null);
              setError(null);
            }}
          />
        </>
      ) : null}
      {complete ? (
        <Card>
          <SectionTitle>Import Complete</SectionTitle>
          <Body>Imported: {complete.batch.row_count} transactions</Body>
          <Body>Expenses: {formatAmount(complete.expenseCents)}</Body>
          <Body>Income: {formatAmount(complete.incomeCents)}</Body>
          <Body>Skipped: {complete.batch.skipped_count} invalid rows</Body>
          <Body>
            Saved on this device. Pending records synchronize through normal
            cloud sync.
          </Body>
          <Button
            title="View Transactions"
            onPress={() => router.replace("/(tabs)/transactions")}
          />
          <Button secondary title="Done" onPress={() => router.back()} />
        </Card>
      ) : null}
    </Screen>
  );
}
