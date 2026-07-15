/**
 * <GuestGuide> — a lightweight, collapsible "what is this screen" card for the
 * external executive journey. Reads a client-audience entry from
 * AFFIRM_SCREEN_GUIDES and renders it with a native <details> (keyboard-
 * accessible, no client JS). Deliberately does NOT mount the consultant
 * AffirmLearnProvider / glossary tooling on the guest surface — the exec copy
 * is already plain-language; see docs/affirm-external/BUILD-LOG.md.
 */

import { AFFIRM_SCREEN_GUIDES } from "@/constants/affirm-screen-guides";

export function GuestGuide({ id, defaultOpen = false }: { id: string; defaultOpen?: boolean }) {
  const guide = AFFIRM_SCREEN_GUIDES[id];
  if (!guide || guide.audience !== "client") return null;
  return (
    <details
      open={defaultOpen}
      className="mb-6 rounded-card-warm border border-border-default bg-cream p-0"
    >
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="inline-flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {guide.eyebrow}
          </span>
          <span className="text-sm font-semibold text-ink">· {guide.title}</span>
        </span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-[13px] leading-5 text-ink-soft">
        <p>{guide.what}</p>
        <p>
          <span className="font-semibold text-ink">What to do:</span> {guide.todo}
        </p>
        <p>
          <span className="font-semibold text-ink">Why:</span> {guide.why}
        </p>
      </div>
    </details>
  );
}
