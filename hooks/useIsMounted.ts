import { useCallback, useEffect, useRef } from "react";
/** Avoid navigating a second time if the user already left during a local write. */
export function useIsMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
