import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  getTransactionViews,
  type TransactionView,
} from "../database/repositories/financeReadRepository";
import { useFinanceStore } from "../store/financeStore";
import { reportError } from "../utils/errors";
import type { TransactionFilters } from "../types/statistics";
const pageSize = 50;
const emptyFilters: TransactionFilters = {};
export function useTransactionHistory(
  search: string,
  filters: TransactionFilters = emptyFilters,
) {
  const db = useSQLiteContext();
  const revision = useFinanceStore((state) => state.revision);
  const [records, setRecords] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const epoch = useRef(0);
  const busy = useRef(false);
  const offset = useRef(0);
  const focused = useRef(false);
  const fetchPage = useCallback(
    async (version: number, start: number) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setError(null);
      try {
        const rows = await getTransactionViews(db, {
          ...filters,
          search,
          offset: start,
          limit: pageSize + 1,
        });
        if (epoch.current !== version || !focused.current) return;
        setHasMore(rows.length > pageSize);
        const page = rows.slice(0, pageSize);
        setRecords((previous) => (start === 0 ? page : [...previous, ...page]));
        offset.current = start + page.length;
      } catch (cause) {
        reportError("Transaction history failed", cause);
        if (epoch.current === version && focused.current)
          setError("Could not load transactions. Please try again.");
      } finally {
        if (epoch.current === version) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [db, search, filters],
  );
  useFocusEffect(
    useCallback(() => {
      void revision;
      void retry;
      focused.current = true;
      const version = ++epoch.current;
      busy.current = false;
      offset.current = 0;
      setRecords([]);
      setHasMore(false);
      void fetchPage(version, 0);
      return () => {
        focused.current = false;
        epoch.current++;
        busy.current = false;
      };
    }, [fetchPage, revision, retry]),
  );
  return {
    records,
    loading,
    error,
    hasMore,
    refresh: () => setRetry((value) => value + 1),
    loadMore: () => {
      if (focused.current && hasMore)
        void fetchPage(epoch.current, offset.current);
    },
  };
}
