/**
 * <GuestTerminal> — S3 terminal shell for the Affirm external surface.
 *
 * Cream page, wordmark, and a paper terminal-shell card carrying eyebrow / serif
 * heading / body and a generic "contact your consultant" note. We deliberately
 * do NOT render a specific consultant identity here: /a/expired is polymorphic
 * (invalid / revoked / superseded / lockout / expired all land here) and must
 * never oracle why, nor fabricate a person. Token-only.
 */

import { GuestShell, Wordmark } from "@/components/affirm/external/GuestShell";

export function GuestTerminal({
  eyebrow,
  heading,
  body,
}: {
  eyebrow: string;
  heading: string;
  body: string;
}) {
  return (
    <GuestShell>
      <main className="mx-auto max-w-[560px] px-[clamp(16px,4vw,32px)] pb-[72px] pt-16 text-center">
        <div className="mb-8 flex justify-center">
          <Wordmark size="lg" />
        </div>
        <section className="rounded-card-warm border border-border-default bg-paper px-8 py-10 text-left shadow-card">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {eyebrow}
          </p>
          <h1 className="font-serif text-[30px] font-medium leading-[38px] text-ink">{heading}</h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-ink-soft">{body}</p>
          <div className="mt-6 border-t border-border-default pt-6 text-[13px] leading-5 text-ink-soft">
            Please refer to the invitation email from your ABeam consultant, or reply to it to
            request a new link.
          </div>
        </section>
      </main>
    </GuestShell>
  );
}
