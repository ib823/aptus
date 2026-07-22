import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGentleAutoRefresh } from "@/hooks/useGentleAutoRefresh";

/**
 * WS3 — the gentle auto-refresh SCHEDULER. It fires on focus + on a low-freq
 * timer, only when enabled, and registers nothing when disabled. It never
 * forces anything — the callback owns cache reuse — so this just proves the
 * firing discipline.
 */
describe("useGentleAutoRefresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires on window focus when enabled", () => {
    const onRefresh = vi.fn();
    renderHook(() => useGentleAutoRefresh({ enabled: true, onRefresh }));
    expect(onRefresh).not.toHaveBeenCalled(); // no eager fire on mount
    window.dispatchEvent(new Event("focus"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("fires on the interval (default 60s) when enabled", () => {
    const onRefresh = vi.fn();
    renderHook(() => useGentleAutoRefresh({ enabled: true, onRefresh, intervalMs: 60_000 }));
    vi.advanceTimersByTime(59_000);
    expect(onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("registers NOTHING when disabled — no focus fire, no timer fire", () => {
    const onRefresh = vi.fn();
    renderHook(() => useGentleAutoRefresh({ enabled: false, onRefresh }));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(120_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("removes listeners/timer on unmount", () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() => useGentleAutoRefresh({ enabled: true, onRefresh }));
    unmount();
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(120_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
