import {
  Directory,
  File,
  FileMode,
  Paths,
  type FileHandle,
} from "expo-file-system";
import * as Sharing from "expo-sharing";
import { randomUUID } from "expo-crypto";
import { AppState } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import type { TransactionFilters } from "../types/statistics";
import {
  writeCsv,
  writeJsonBackup,
} from "../database/repositories/exportRepository";
import { appLock } from "./appLock";
/** Files stay in private cache for recipients; delete previous-day exports on next export. */
export async function shareFinanceExport(
  db: SQLiteDatabase,
  kind: "csv" | "json",
  filters: TransactionFilters,
  label: string,
  progress: (count: number) => void,
  cancelled: () => boolean,
) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing requires a supported Android or iOS device.");
  const root = new Directory(Paths.cache, "finance-exports");
  root.create({ intermediates: true, idempotent: true });
  for (const entry of root.list()) {
    if (
      entry instanceof File &&
      entry.modificationTime !== null &&
      entry.modificationTime < Date.now() - 86400000
    )
      entry.delete();
  }
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const file = new File(
    root,
    `finance_${safeLabel}_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}.${kind}`,
  );
  const check = () => {
    const lock = appLock.getSnapshot();
    if (
      cancelled() ||
      AppState.currentState !== "active" ||
      !lock.ready ||
      lock.locked ||
      lock.backgrounded
    )
      throw new Error("Export interrupted. Unlock the app and try again.");
  };
  check();
  file.create();
  let handle: FileHandle | undefined;
  let complete = false;
  try {
    handle = file.open(FileMode.WriteOnly);
    const output = handle;
    const write = (text: string) =>
      output.writeBytes(new TextEncoder().encode(text));
    if (kind === "csv") await writeCsv(db, filters, write, check, progress);
    else await writeJsonBackup(db, write, check);
    check();
    complete = true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Export interrupted. Unlock the app and try again."
    )
      throw error;
    throw new Error(
      "Unable to create export file. Check your dates and available storage, then retry.",
    );
  } finally {
    handle?.close();
    if (!complete && file.exists) file.delete();
  }
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: kind === "csv" ? "text/csv" : "application/json",
      UTI:
        kind === "csv" ? "public.comma-separated-values-text" : "public.json",
      dialogTitle: "Share Finance export",
    });
  } catch {
    if (file.exists) file.delete();
    throw new Error("Unable to open sharing. Please try again.");
  }
}
