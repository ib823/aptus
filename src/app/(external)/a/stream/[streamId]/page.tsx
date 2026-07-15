/**
 * GET /a/stream/[streamId] — L1 index for one value stream.
 *
 * Guards the stream is in the grant's scope. Renders scope items as story cards
 * (headline, ≤4 outcome bullets, question progress, chapter count → process
 * story). Items without a reviewed story render a compact card (description +
 * question count only) — never a fake narrative.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { getGuestStreamIndex } from "@/lib/affirm/external/journey";
import { GuestGuide } from "@/components/affirm/external/GuestGuide";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ streamId: string }>;
}

export default async function AffirmStreamPage({ params }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/a/verify");
  void touchGuestSession(ctx.session.id);

  const { streamId } = await params;
  const index = await getGuestStreamIndex(ctx.grant.id, streamId);
  // Null → not in the grant's scope. Polymorphic: bounce home.
  if (!index) redirect("/a/home");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/a/home" className="hover:text-ink">
          Home
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">{index.streamName}</span>
      </nav>

      <header className="mb-8">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {index.bundle.client}
        </p>
        <h1 className="font-serif text-3xl text-ink">{index.streamName}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Pick a process to see how the standard works, then tell us where your business differs.
        </p>
      </header>

      <GuestGuide id="affirm-exec-stream" />

      <div className="space-y-4">
        {index.cards.map((c) =>
          c.headline ? (
            <Link
              key={c.scopeItemId}
              href={`/a/process/${encodeURIComponent(c.scopeItemId)}`}
              className="group block rounded-card-warm border border-border-default bg-paper p-5 shadow-card transition hover:border-navy/40"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-serif text-xl text-ink group-hover:text-navy">{c.headline}</h2>
                <span className="shrink-0 text-xs text-ink-muted">
                  {c.answered}/{c.questionCount} answered
                </span>
              </div>
              {c.outcomeBullets.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {c.outcomeBullets.slice(0, 4).map((b, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-5 text-ink-soft">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-decision-standard" aria-hidden="true" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-muted">
                {c.chapterCount} chapter{c.chapterCount === 1 ? "" : "s"} · {c.questionCount} question
                {c.questionCount === 1 ? "" : "s"} · <span className="text-navy group-hover:underline">See the process →</span>
              </p>
            </Link>
          ) : (
            <div
              key={c.scopeItemId}
              className="rounded-card-warm border border-border-default bg-paper/60 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-ink">{c.description}</p>
                <span className="shrink-0 text-xs text-ink-muted">
                  {c.answered}/{c.questionCount} answered
                </span>
              </div>
              {c.questionCount > 0 ? (
                <Link
                  href={`/a/affirm/${encodeURIComponent(c.scopeItemId)}`}
                  className="mt-2 inline-block text-xs font-medium text-navy hover:underline"
                >
                  Answer {c.questionCount} question{c.questionCount === 1 ? "" : "s"} →
                </Link>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">No questions for you on this item.</p>
              )}
            </div>
          ),
        )}
        {index.cards.length === 0 && (
          <p className="rounded-card-warm border border-border-default bg-paper px-5 py-6 text-sm text-ink-muted">
            Nothing to review in this stream yet.
          </p>
        )}
      </div>
    </main>
  );
}
