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
 * ACCESSIBILITY: purely decorative. `aria-hidden`, and the real signal remains
 * `aria-current="page"` on the item itself — the bar is a visual convenience,
 * never the thing that tells a screen reader where it is.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Box {
  top: number;
  height: number;
}

/** `useLayoutEffect` warns during SSR; on the server there is nothing to measure. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function RailHighlight({
  /** Identifies the active item. A change here is what makes the bar travel. */
  activeKey,
  children,
}: {
  activeKey: string | null;
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

    function measure() {
      const el = container?.querySelector<HTMLElement>(`[data-rail-item="${activeKey}"]`);
      if (!el || !container) {
        setBox(null);
        return;
      }
      setBox({ top: el.offsetTop, height: el.offsetHeight });
    }

    measure();

    // The rail can reflow — a longer label wrapping, a font arriving late. The
    // bar follows rather than staying where the first measurement put it.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeKey]);

  // After the first positioned frame, subsequent moves may animate.
  useEffect(() => {
    if (box) {
      const id = requestAnimationFrame(() => {
        hasMoved.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [box]);

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
