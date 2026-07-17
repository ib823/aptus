/**
 * ABeam Workbench — mode switch (brief §6/22). Closes D8.
 *
 * "Segmented control top-right of the app bar: Present · Explore · Export. Pill
 * segments, selected = navy fill white. Persists per session. Keyboard P/E/X."
 *
 * Deferred from PR-2a because Present and Export did not exist and the .dc
 * supplies no toast copy to stub with. Both exist now, so it ships functional.
 *
 * Semantics: the .dc uses `role="tablist"` with plain buttons — no `role="tab"`,
 * no `aria-selected`, so a screen reader hears three unrelated buttons
 * (conflict #26). These are links, because each mode is a real destination the
 * reviewer should be able to open, share, or go back from; `aria-current="page"`
 * carries the selected state. A tablist would be a lie — nothing is a tabpanel.
 *
 * P/E/X are bound globally (§6/22) but suppressed while typing, so a reviewer
 * writing "we park expensive orders" in a reason box does not teleport.
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  DISCOVERY_MODES,
  DISCOVERY_MODE_COOKIE,
  DISCOVERY_MODE_COOKIE_PATH,
  MODE_KEYS,
  MODE_LABELS,
  type DiscoveryMode,
} from "@/lib/discovery/mode";

export interface ModeSwitchProps {
  mode: DiscoveryMode;
  /** Present/Explore live on the current route; Export is its own page. */
  exportHref?: string;
}

/** Order per §6/22: Present · Explore · Export. */
const ORDER: DiscoveryMode[] = ["present", "explore", "export"];

export function ModeSwitch({ mode, exportHref = "/d/export" }: ModeSwitchProps) {
  const router = useRouter();

  const setMode = useCallback(
    (next: DiscoveryMode) => {
      if (next === mode) return;
      // UI state, not a credential: no httpOnly, Path=/d, session-lifetime.
      document.cookie = `${DISCOVERY_MODE_COOKIE}=${next}; path=${DISCOVERY_MODE_COOKIE_PATH}; samesite=strict`;
      if (next === "export") router.push(exportHref);
      else router.refresh();
    },
    [mode, router, exportHref],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never hijack a keystroke meant for a text field.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      for (const m of DISCOVERY_MODES) {
        // In Present, `P` means Park (§6/23), not "go to Present" — we are
        // already here. The facilitator bar owns that key; we yield it.
        if (m === "present" && mode === "present") continue;
        if (key === MODE_KEYS[m]) {
          e.preventDefault();
          setMode(m);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, setMode]);

  return (
    <nav aria-label="View mode">
      <ul className="flex gap-0.5 rounded-pill bg-ink-tint p-[3px]">
        {ORDER.map((m) => {
          const selected = m === mode;
          return (
            <li key={m}>
              <button
                type="button"
                onClick={() => setMode(m)}
                aria-current={selected ? "page" : undefined}
                className={`ax-touch flex h-[30px] items-center rounded-pill px-3.5 text-xs font-semibold transition-colors duration-[var(--dur-hero)] focus-visible:shadow-focus-ring focus-visible:outline-none motion-reduce:transition-none ${
                  selected ? "bg-navy text-white" : "bg-transparent text-ink-muted hover:opacity-85"
                }`}
              >
                {MODE_LABELS[m]}
                <span className="sr-only"> mode{selected ? " (current)" : ""}</span>
                <kbd
                  aria-hidden="true"
                  className={`ml-1.5 hidden font-mono text-[9px] uppercase lg:inline ${selected ? "text-white/60" : "text-ink-disabled"}`}
                >
                  {MODE_KEYS[m]}
                </kbd>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
