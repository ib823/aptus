"use client";

/**
 * The rail's selection indicator — one bar that MOVES, rather than a background
 * that blinks from one item to another.
 *
 * WHY BOTHER. The rail is the only thing on screen that tells you where you are,
 * and it is the thing you look at while changing where you are. A highlight that
 * disappears and reappears makes the eye re-find it; one that travels carries
 * the eye with it, so the destination is already being looked at when the page
 * arrives. It is a small thing that makes navigation feel answered rather than
 * reloaded.
 *
 * HOW. A single absolutely-positioned element sits behind the list and is
 * translated to the active item's box, measured from the DOM. The items
 * themselves render no background at all — there is exactly one highlight in the
 * rail and it has one position, so two items can never both look selected during
 * a transition.
 *
 * WHAT IT DOES NOT DO:
 *
 *   · It does not animate on first paint. Sliding in from the top on every load
 *     would be motion that communicates nothing.
 *   · It does not render when nothing is active — a section list on a path it
 *     does not contain shows no bar rather than a bar parked on the first item.
 *   · It does not move for anyone who has asked the system for less motion. The
 *     bar still goes to the right place; it simply arrives immediately.
 *
 * ACROSS AN UNMOUNT. The three workspaces are separate route groups with
 * separate layouts, so switching between them tears this component down and
 * builds a new one. A remounted bar knows nothing about where it was, which is
 * why the workspace switcher sat still while the section list — which lives
 * inside one layout and stays mounted — travelled. `persistAs` remembers the
 * last position for the duration of the session, so the bar starts where it
 * actually was and moves from there.
 *
 * ACCESSIBILITY: purely decorative. `aria-hidden`, and the real signal remains
 * `aria-current="page"` on the item itself — the bar is a visual convenience,
 * never the thing that tells a screen reader where it is.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Box {
  top: number;
  height: number;
}

/**
 * Where the bar was, across an unmount.
 *
 * `sessionStorage` and not a module variable: a module variable would survive a
 * full page load, so the bar would animate from a position the user last saw in
 * a previous session. Session scope matches what a person would call "where I
 * just was". Every access is guarded — storage is unavailable in some privacy
 * modes, and a decorative bar must never be what throws.
 */
function readRemembered(key: string): string | null {
  try {
    return window.sessionStorage.getItem(`ce-rail:${key}`);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(`ce-rail:${key}`, value);
  } catch {
    // Ignored on purpose: without storage the bar simply does not travel
    // between workspaces, which is the behaviour it had before.
  }
}

/** `useLayoutEffect` warns during SSR; on the server there is nothing to measure. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function RailHighlight({
  /** Identifies the active item. A change here is what makes the bar travel. */
  activeKey,
  persistAs,
  children,
}: {
  activeKey: string | null;
  /**
   * Remember the last active item under this key, so the bar can travel across
   * an UNMOUNT.
   *
   * WHY THIS IS NEEDED AT ALL. The three workspaces are separate route groups
   * with separate layouts, so moving between them swaps the layout and this
   * component unmounts and remounts. A remounted bar has no idea where it was
   * and simply appears at the new item — which is why the workspace switcher
   * did not animate while the section list, which stays mounted inside one
   * layout, did.
   *
   * With a key, the bar paints once at the PREVIOUS item's position without a
   * transition, then moves to the new one on the following frame. The animation
   * is therefore honest: it travels from where it actually was.
   *
   * Omit it for lists whose items are not comparable across mounts — a Control
   * Tower section has no meaningful "previous position" in Developer Studio's
   * list, and animating between them would invent a relationship.
   */
  persistAs?: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  // First measurement positions the bar; it must not animate into place.
  const hasMoved = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Guarded, not assumed. `matchMedia` is absent in jsdom and in some embedded
    // webviews, and a decorative bar must never be the reason the navigation
    // rail fails to render. Without it the bar simply does not animate, which is
    // the same outcome as honouring a reduced-motion preference.
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || activeKey === null) {
      setBox(null);
      hasMoved.current = false;
      return;
    }

    const boxOf = (key: string): Box | null => {
      const el = container.querySelector<HTMLElement>(`[data-rail-item="${key}"]`);
      return el ? { top: el.offsetTop, height: el.offsetHeight } : null;
    };

    const current = boxOf(activeKey);
    if (!current) {
      setBox(null);
      return;
    }

    // On a FRESH MOUNT, start from wherever the bar was last time — if there is
    // a remembered position, it differs, and the item is still on screen.
    // Otherwise position directly, with no transition.
    let startedElsewhere = false;
    if (!hasMoved.current && persistAs) {
      const previous = readRemembered(persistAs);
      if (previous && previous !== activeKey) {
        const from = boxOf(previous);
        if (from) {
          setBox(from);
          startedElsewhere = true;
        }
      }
    }

    if (!startedElsewhere) setBox(current);
    if (persistAs) remember(persistAs, activeKey);

    // Two frames: the first commits the starting position without a
    // transition, the second turns the transition on and moves. One frame is
    // not reliably enough for the browser to have painted the start.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        hasMoved.current = true;
        if (startedElsewhere) setBox(current);
      });
    });

    // The rail can reflow — a longer label wrapping, a font arriving late. The
    // bar follows rather than staying where the first measurement put it.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const latest = boxOf(activeKey);
            if (latest) setBox(latest);
          });
    observer?.observe(container);

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      observer?.disconnect();
    };
  }, [activeKey, persistAs]);

  const animate = hasMoved.current && !reduceMotion;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {box ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: box.height,
            transform: `translateY(${box.top}px)`,
            borderRadius: 8,
            background: "rgba(255,255,254,0.14)",
            // Ease-out: quick to leave, settling into the destination. The eye
            // is following the bar to where it is going, not watching it depart.
            transition: animate
              ? "transform 220ms cubic-bezier(0.32, 0.72, 0, 1), height 220ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "none",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
