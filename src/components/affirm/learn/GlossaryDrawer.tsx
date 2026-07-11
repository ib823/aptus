"use client";

/**
 * "Decode the jargon" — a searchable glossary drawer (right-side Sheet).
 *
 * Lists every affirm term in plain language. Opened from the learn
 * toolbar, from a <Term> chip's "Open in glossary", or from a related-
 * term chip — in the latter two cases `focusTerm` scrolls to and
 * highlights that entry.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { glossaryFor } from "@/lib/learn/content";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusTerm: string | null;
}

export function GlossaryDrawer({ open, onOpenChange, focusTerm }: Props) {
  const pathname = usePathname() ?? "";
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // Glossary set is path-aware: affirm terms on /affirm, SAP terms on /sap-explorer.
  const { entries, order } = useMemo(() => glossaryFor(pathname), [pathname]);

  const keys = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return order;
    return order.filter((k) => {
      const e = entries[k];
      if (!e) return false;
      return (
        e.term.toLowerCase().includes(needle) ||
        e.short.toLowerCase().includes(needle) ||
        e.why.toLowerCase().includes(needle)
      );
    });
  }, [query, order, entries]);

  // When opened with a focus term, clear any search filter and scroll to it.
  useEffect(() => {
    if (!open || !focusTerm) return;
    setQuery("");
    const t = setTimeout(() => {
      const el = document.getElementById(`gl-${focusTerm}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => clearTimeout(t);
  }, [open, focusTerm]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border-default bg-paper p-0 text-ink sm:max-w-md"
      >
        <div className="border-b border-border-default px-5 pb-4 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Plain-language help
          </p>
          <h2 className="mt-0.5 font-serif text-2xl text-ink">Decode the jargon</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Every SAP term in this tool, explained without the jargon.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms…"
            className="mt-3 w-full rounded-input border border-border-default bg-cream px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-navy"
            aria-label="Search glossary"
          />
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
          {keys.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              No terms match “{query}”.
            </p>
          ) : (
            <ul className="space-y-4">
              {keys.map((k) => {
                const e = entries[k];
                if (!e) return null;
                const focused = focusTerm === k;
                return (
                  <li
                    key={k}
                    id={`gl-${k}`}
                    className={`rounded-card-warm border p-4 transition ${
                      focused
                        ? "border-navy bg-navy-soft"
                        : "border-border-default bg-cream"
                    }`}
                  >
                    <p className="font-serif text-[15px] leading-snug text-ink">{e.term}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{e.short}</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      <span className="font-semibold text-ink-soft">Why it matters — </span>
                      {e.why}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
