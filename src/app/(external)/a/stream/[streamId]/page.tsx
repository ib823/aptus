/**
 * GET /a/stream/[streamId] — S5 Stream index (L1).
 *
 * Guards the stream ∈ grant scope. Story cards for scope items with a reviewed
 * story; a compact dashed fallback card (description + question count only) for
 * items without one — never a fake narrative. Restyled to the design.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { getGuestStreamIndex } from "@/lib/affirm/external/journey";
import { GuestShell } from "@/components/affirm/external/GuestShell";
import { StatusPill } from "@/components/affirm/external/StatusPill";
import { GuestGuide } from "@/components/affirm/external/GuestGuide";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ streamId: string }>;
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default async function AffirmStreamPage({ params }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/a/verify");
  void touchGuestSession(ctx.session.id);

  const { streamId } = await params;
  const index = await getGuestStreamIndex(ctx.grant.id, streamId);
  if (!index) redirect("/a/home");

  const withQuestions = index.cards.filter((c) => c.questionCount > 0);
  const complete =
    withQuestions.length > 0 && withQuestions.every((c) => c.answered >= c.questionCount);

  return (
    <GuestShell
      granteeName={ctx.grant.displayName}
      granteeRole={ctx.grant.roleLabel}
      clientName={index.bundle.client}
    >
      <main className="mx-auto max-w-[880px] px-[clamp(16px,4vw,32px)] pb-20 pt-9">
        <Link
          href="/a/home"
          className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted transition hover:text-navy"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Home / {index.streamName}
        </Link>

        <h1 className="font-serif text-[30px] font-medium leading-10 text-ink">{index.streamName}</h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-[1.55] text-ink-soft">
          Pick a process to see how the standard works, then tell us where your business differs.
        </p>

        <GuestGuide id="affirm-exec-stream" />

        {complete && (
          <div className="mb-5 rounded-input border border-[color-mix(in_srgb,var(--color-decision-standard)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-decision-standard)_12%,var(--color-paper))] px-4 py-3 text-[13px] font-medium text-decision-standard">
            All processes in this stream affirmed ✓
          </div>
        )}

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
          {index.cards.map((c) =>
            c.headline ? (
              <Link
                key={c.scopeItemId}
                href={`/a/process/${encodeURIComponent(c.scopeItemId)}`}
                className="group flex flex-col gap-3 rounded-card-warm border border-border-default bg-paper p-5 shadow-card transition hover:-translate-y-px hover:shadow-card-hover focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-[22px] items-center rounded-[5px] bg-navy px-1.5 font-mono text-[11px] font-bold text-white">
                    {c.scopeItemId}
                  </span>
                  {c.answered >= c.questionCount && c.questionCount > 0 ? (
                    <StatusPill tone="standard">Affirmed</StatusPill>
                  ) : c.answered > 0 ? (
                    <StatusPill tone="navy">
                      {c.answered}/{c.questionCount}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Not started</StatusPill>
                  )}
                </div>
                <h2 className="font-serif text-[18px] font-medium leading-[1.3] text-ink group-hover:text-navy">
                  {c.headline}
                </h2>
                {c.outcomeBullets.length > 0 && (
                  <ul className="space-y-1.5">
                    {c.outcomeBullets.slice(0, 4).map((b, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-[19px] text-ink-soft">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-decision-standard" aria-hidden="true" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex items-center justify-between border-t border-ink-tint pt-3 font-mono text-[11px] text-ink-muted">
                  <span>
                    {c.questionCount} question{c.questionCount === 1 ? "" : "s"} ·{" "}
                    {c.chapterCount > 0 ? `${c.chapterCount} chapter${c.chapterCount === 1 ? "" : "s"}` : "flow view"}
                  </span>
                  <Chevron />
                </div>
              </Link>
            ) : (
              <Link
                key={c.scopeItemId}
                href={c.questionCount > 0 ? `/a/affirm/${encodeURIComponent(c.scopeItemId)}` : `/a/process/${encodeURIComponent(c.scopeItemId)}`}
                className="group flex flex-col gap-2.5 rounded-card-warm border border-dashed border-border-strong bg-paper p-[18px] transition hover:bg-ink-tint focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                <span className="inline-flex h-[22px] w-fit items-center rounded-[5px] bg-navy px-1.5 font-mono text-[11px] font-bold text-white">
                  {c.scopeItemId}
                </span>
                <p className="text-[13px] leading-[19px] text-ink-soft">{c.description}</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="inline-flex items-center rounded-pill bg-[color-mix(in_srgb,var(--color-decision-configure)_15%,transparent)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-decision-configure">
                    {c.questionCount} question{c.questionCount === 1 ? "" : "s"}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
              </Link>
            ),
          )}
          {index.cards.length === 0 && (
            <p className="rounded-card-warm border border-border-default bg-paper px-5 py-6 text-[14px] text-ink-muted">
              Nothing to review in this stream yet.
            </p>
          )}
        </div>
      </main>
    </GuestShell>
  );
}
