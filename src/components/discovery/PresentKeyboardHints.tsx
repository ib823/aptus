/**
 * ABeam Workbench — Present keyboard hints (brief §8).
 *
 * "keyboard hints (subtle, bottom-left, fade after 4s)".
 *
 * Fading a hint after 4s is fine for a projector and hostile to anyone who needs
 * longer to read it — so the fade is visual only: the element stays in the
 * accessibility tree, and `prefers-reduced-motion` keeps it visible rather than
 * animating it away. A hint that vanishes is a hint you cannot re-read, so it
 * also returns on any keypress.
 */

"use client";

import { useEffect, useState } from "react";

const HINTS = [
  { keys: "1–4", label: "Set fit" },
  { keys: "← →", label: "Steps" },
  { keys: "⇧← ⇧→", label: "Processes" },
  { keys: "Space", label: "Reveal" },
  { keys: "P", label: "Park" },
  { keys: "E", label: "Explore" },
];

export function PresentKeyboardHints() {
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFaded(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function wake() {
      setFaded(false);
      const t = setTimeout(() => setFaded(true), 4000);
      return () => clearTimeout(t);
    }
    window.addEventListener("keydown", wake);
    return () => window.removeEventListener("keydown", wake);
  }, []);

  return (
    <ul
      className={`pointer-events-none fixed bottom-[76px] left-12 z-10 flex flex-wrap gap-3 transition-opacity duration-[var(--dur-hero)] motion-reduce:opacity-100 motion-reduce:transition-none ${
        faded ? "opacity-0" : "opacity-100"
      }`}
    >
      {HINTS.map((h) => (
        <li key={h.keys} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <kbd className="rounded-[5px] border border-border-default bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
            {h.keys}
          </kbd>
          {h.label}
        </li>
      ))}
    </ul>
  );
}
