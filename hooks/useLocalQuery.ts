import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useFinanceStore } from "../store/financeStore";
import { reportError } from "../utils/errors";
/** Screen-local SQLite snapshot. Stable loader; focused screens react to committed writes. */
export function useLocalQuery<T>(loader: () => Promise<T>) {
  const revision = useFinanceStore((state) => state.revision);
  const [retry, setRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    loader: () => Promise<T>;
    data: T;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [settledLoader, setSettledLoader] = useState<(() => Promise<T>) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void revision;
      void retry; // Committed writes and explicit retries invalidate this snapshot.
      let active = true;
      setLoading(true);
      setError(null);
      loader()
        .then((value) => {
          if (active) setSnapshot({ loader, data: value });
        })
        .catch((cause: unknown) => {
          reportError("Could not load local records", cause);
          if (active)
            setError("Could not load your records. Please try again.");
        })
        .finally(() => {
          if (active) {
            setSettledLoader(() => loader);
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }, [loader, revision, retry]),
  );
  useFocusEffect(
    useCallback(() => {
      void retry; // Re-arm the next midnight refresh after a foreground or timer refresh.
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") setRetry((value) => value + 1);
      });
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const timer = setTimeout(
        () => setRetry((value) => value + 1),
        midnight.getTime() - Date.now() + 100,
      );
      return () => {
        subscription.remove();
        clearTimeout(timer);
      };
    }, [retry]),
  );
  return {
    data: snapshot?.loader === loader ? snapshot.data : null,
    loading: loading || settledLoader !== loader,
    error: settledLoader === loader ? error : null,
    refresh: () => setRetry((value) => value + 1),
  };
}
