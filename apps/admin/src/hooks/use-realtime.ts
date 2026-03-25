import { useEffect, useRef } from "react";

/**
 * Subscribe to table changes via polling.
 * Polls every 20s and refreshes on tab focus.
 */
export function useRealtimeSubscription(
  table: string,
  onChange: () => void,
) {
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!table) return;
    pollRef.current = window.setInterval(() => onChange(), 20000);
    const onFocus = () => onChange();
    window.addEventListener("focus", onFocus);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
      window.removeEventListener("focus", onFocus);
    };
  }, [table, onChange]);
}
