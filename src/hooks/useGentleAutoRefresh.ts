import { useEffect, useRef } from "react";

/**
 * Gentle, opt-in auto-refresh. When `enabled`, it calls `onRefresh`:
 *   • when the tab regains focus / becomes visible again, and
 *   • on a low-frequency timer (default every 60s).
 *
 * It is a SCHEDULER only — it never forces a live re-read. The callback is
 * expected to reuse any short-TTL cache (i.e. NOT send ?refresh=1), so even
 * rapid focus events collapse onto the cache rather than hammering upstream.
 * When `enabled` is false it registers no listeners and no timer at all. The
 * latest callback is held in a ref so passing an inline arrow never churns the
 * listener set.
 */
export function useGentleAutoRefresh({
  enabled,
  onRefresh,
  intervalMs = 60_000,
}: {
  enabled: boolean;
  onRefresh: () => void;
  intervalMs?: number;
}): void {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const fire = () => cb.current();
    const onFocus = () => fire();
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") fire();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(fire, intervalMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);
}
