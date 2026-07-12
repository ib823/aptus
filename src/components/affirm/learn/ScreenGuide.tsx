"use client";

/**
 * ScreenGuide — the dismissible plain-language "What is this screen?"
 * card shown at the top of each affirm screen.
 *
 * Auto-selects its content from the current pathname (see
 * screenGuideForPath). Dismissal is remembered per screen in
 * localStorage; a collapsed "Show guide" chip lets the user bring it
 * back. The whole thing is a client island — drop <ScreenGuide /> at the
 * top of any affirm page (server component) and it wires itself up.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { resolveScreenGuide, screenGuideById, glossaryEntry } from "@/lib/learn/content";
import { useAffirmLearn } from "./context";

const dismissKey = (id: string) => `affirm-guide-dismissed:${id}`;
// Marks that the guide has been shown expanded at least once. After the first
// visit it defaults to the collapsed chip so returning users aren't re-lectured;
// the chip still reopens it on demand.
const seenKey = (id: string) => `affirm-guide-seen:${id}`;

/**
 * Renders the page-level guide by path, or — when an explicit `id` is passed —
 * a specific section guide (so a page can drop <ScreenGuide id="sap-catalogue" />
 * above each section).
 */
export function ScreenGuide({ id }: { id?: string } = {}) {
  const pathname = usePathname() ?? "";
  const guide = id ? screenGuideById(id) : resolveScreenGuide(pathname);
  const { openGlossary, startTour, hasTour } = useAffirmLearn();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid SSR flash
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!guide) return;
    let collapsed = false;
    try {
      // Collapse if explicitly hidden OR already seen on a prior visit — the guide
      // shows expanded only on the very first visit, then defaults to the chip.
      const dismissed = localStorage.getItem(dismissKey(guide.id)) === "1";
      const seen = localStorage.getItem(seenKey(guide.id)) === "1";
      collapsed = dismissed || seen;
      if (!seen) localStorage.setItem(seenKey(guide.id), "1");
    } catch {
      /* ignore */
    }
    setDismissed(collapsed);
  }, [guide]);

  if (!guide || !hydrated) return null;

  function dismiss() {
    if (!guide) return;
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(guide.id), "1");
    } catch {
      /* ignore */
    }
  }

  function reopen() {
    if (!guide) return;
    setDismissed(false);
    try {
      localStorage.removeItem(dismissKey(guide.id));
    } catch {
      /* ignore */
    }
  }

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={reopen}
        data-tour="affirm-guide"
        className="mb-5 inline-flex items-center gap-1.5 rounded-pill border border-border-default bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm transition hover:border-navy hover:text-navy"
      >
        <span aria-hidden>💡</span> What is this screen?
      </button>
    );
  }

  return (
    <section
      data-tour="affirm-guide"
      className="mb-6 overflow-hidden rounded-card-warm border border-border-default bg-navy-soft shadow-card"
      aria-label="Screen guide"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
            {guide.eyebrow}
          </p>
          <h2 className="mt-0.5 font-serif text-xl text-ink">{guide.title}</h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 shrink-0 rounded-pill px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-paper hover:text-ink"
          aria-label="Hide screen guide"
        >
          Hide
        </button>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 pb-4 pt-3 sm:grid-cols-2">
        <GuideLine label="What this is" text={guide.what} />
        <GuideLine label="What to do" text={guide.todo} />
        <GuideLine label="Why it matters" text={guide.why} />
        <GuideLine label="What's next" text={guide.next} />
      </div>

      {(guide.keyTerms?.length || hasTour) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-default/70 bg-paper/50 px-5 py-3">
          {guide.keyTerms?.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => openGlossary(k)}
              className="rounded-pill border border-border-default bg-paper px-2.5 py-1 text-xs text-ink-soft transition hover:border-navy hover:text-navy"
            >
              {glossaryEntry(k)?.term ?? k}
            </button>
          ))}
          {hasTour && (
            <button
              type="button"
              onClick={startTour}
              className="ml-auto rounded-pill bg-navy px-3 py-1 text-xs font-semibold text-white transition hover:bg-navy-hover"
            >
              Guide me through it →
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function GuideLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}
