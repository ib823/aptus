"use client";

/**
 * <Term> — an inline jargon chip.
 *
 * Wrap any SAP/domain term in the affirm UI:
 *   <Term id="scope-item">scope items</Term>
 * It renders the child text with a subtle dotted underline; clicking (or
 * keyboard-activating) opens a popover with a plain-language definition,
 * why it matters, and related terms. Related terms and "Open in glossary"
 * jump into the full glossary drawer.
 *
 * Safe to use inside server components — it's a client island. If no
 * provider is mounted, the "Open in glossary" / related actions are inert
 * but the definition still shows.
 */

import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AFFIRM_GLOSSARY, type GlossaryKey } from "@/constants/affirm-glossary";
import { useAffirmLearn } from "./context";

interface TermProps {
  id: GlossaryKey;
  children?: ReactNode;
}

export function Term({ id, children }: TermProps) {
  const entry = AFFIRM_GLOSSARY[id];
  const { openGlossary } = useAffirmLearn();

  if (!entry) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline cursor-help align-baseline underline decoration-dotted decoration-ink-muted underline-offset-[3px] transition-colors hover:decoration-ink focus:outline-none focus-visible:decoration-ink focus-visible:decoration-solid"
          aria-label={`What does "${entry.term}" mean?`}
        >
          {children ?? entry.term}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 max-w-[calc(100vw-2rem)] border-border-default bg-paper p-4 text-ink shadow-card"
      >
        <p className="font-serif text-base leading-snug text-ink">{entry.term}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{entry.short}</p>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Why it matters — </span>
          {entry.why}
        </p>
        {entry.related && entry.related.length > 0 && (
          <div className="mt-3 border-t border-border-default/70 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Related
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.related.map((rk) => (
                <button
                  key={rk}
                  type="button"
                  onClick={() => openGlossary(rk)}
                  className="rounded-pill border border-border-default bg-ink-tint px-2.5 py-1 text-xs text-ink-soft transition hover:border-navy hover:text-navy"
                >
                  {AFFIRM_GLOSSARY[rk]?.term ?? rk}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => openGlossary(id)}
          className="mt-3 text-xs font-semibold text-navy transition hover:text-navy-hover"
        >
          Open in glossary &rarr;
        </button>
      </PopoverContent>
    </Popover>
  );
}
