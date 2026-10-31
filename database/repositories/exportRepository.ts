import type { SQLiteDatabase } from "expo-sqlite";
import type { TransactionFilters } from "../../types/statistics";
import type { TransactionView } from "./financeReadRepository";
import { buildTransactionWhere } from "./filterSql";
import { withReadSnapshot } from "./shared";
import { csvHeader, transactionCsv } from "../../utils/exportCsv";
type Write = (text: string) => void | Promise<void>;
/** Bounded batches and a single snapshot include every match, including adjustments. */
export async function writeCsv(
  db: SQLiteDatabase,
  filters: TransactionFilters,
  write: Write,
  check = () => {},
  progress = (_count: number) => {},
) {
  const frozen = buildTransactionWhere({ ...filters });
  return withReadSnapshot(db, async (tx) => {
    let cursor: TransactionView | undefined;
    let count = 0;
    await write(csvHeader);
    while (true) {
      check();
      // Stable UUID ordering uses the primary key, avoiding a repeated full-ledger sort.
      const rows = await tx.getAllAsync<TransactionView>(
        `SELECT t.*, a.name AS account_name, c.name AS category_name FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id ${frozen.where} ${cursor ? "AND t.id > ?" : ""} ORDER BY t.id LIMIT 500`,
        [...frozen.params, ...(cursor ? [cursor.id] : [])],
      );
      if (!rows.length) return count;
      await write(rows.map(transactionCsv).join(""));
      count += rows.length;
      progress(count);
      cursor = rows[rows.length - 1];
    }
  });
}
/** Finance fields only; never serialize arbitrary metadata or native secure storage. */
export async function writeJsonBackup(
  db: SQLiteDatabase,
  write: Write,
  check = () => {},
) {
  return withReadSnapshot(db, async (tx) => {
    const version = await tx.getFirstAsync<{ version: number }>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    );
    const preferences = await tx.getAllAsync<{ key: string; value: string }>(
      "SELECT key,value FROM app_metadata WHERE key IN ('settings.theme','settings.hide_balances','reminder_enabled','reminder_hour','reminder_minute') ORDER BY key",
    );
    await write(
      JSON.stringify({
        format: "finance-local-backup",
        format_version: 1,
        schema_version: version?.version,
        exported_at: new Date().toISOString(),
        currency: "EUR",
        preferences: Object.fromEntries(
          preferences.map((row) => [row.key, row.value]),
        ),
      }).slice(0, -1),
    );
    const tables = {
      accounts:
        "id,name,type,currency,initial_balance_cents,is_archived,created_at,updated_at,deleted_at",
      categories:
        "id,name,type,icon,is_default,is_archived,created_at,updated_at,deleted_at",
      transfers: "id,from_account_id,to_account_id,amount_cents,transfer_date,note,created_at,updated_at,deleted_at",
      transactions:
        "id,account_id,category_id,type,amount_cents,description,transaction_date,is_balance_adjustment,created_at,updated_at,deleted_at",
    } as const;
    for (const [table, columns] of Object.entries(tables)) {
      await write(`,"${table}":[`);
      let after = "";
      let first = true;
      while (true) {
        check();
        const rows = await tx.getAllAsync<{ id: string }>(
          `SELECT ${columns} FROM ${table} WHERE id > ? ORDER BY id LIMIT 500`,
          after,
        );
        if (!rows.length) break;
        await write(
          (first ? "" : ",") + rows.map((row) => JSON.stringify(row)).join(","),
        );
        first = false;
        after = rows[rows.length - 1].id;
      }
      await write("]");
    }
    await write("}");
  });
}

/** Separate CSV: transfers never masquerade as income or expenses. */
export async function writeTransfersCsv(db: SQLiteDatabase, write: Write, check = () => {}) {
  const { csvCell } = await import('../../utils/exportCsv');
  const { centsToDecimal } = await import('../../utils/currency');
  return withReadSnapshot(db,async tx => {
    await write('\uFEFF'+['record_type','date','from_account','to_account','amount','currency','note','id'].map(v=>csvCell(v)).join(',')+'\r\n');
    let after='';
    while(true) {
      check();
      const rows=await tx.getAllAsync<import('./transferRepository').TransferView>(`SELECT t.*,f.name AS from_account_name,a.name AS to_account_name FROM transfers t JOIN accounts f ON f.id=t.from_account_id JOIN accounts a ON a.id=t.to_account_id WHERE t.deleted_at IS NULL AND t.id>? ORDER BY t.id LIMIT 500`,after);
      if(!rows.length)break;
      for(const row of rows) await write(['Transfer',row.transfer_date,row.from_account_name,row.to_account_name,centsToDecimal(row.amount_cents),'EUR',row.note,row.id].map(v=>csvCell(v,true)).join(',')+'\r\n');
      after=rows[rows.length-1].id;
    }
  });
}
