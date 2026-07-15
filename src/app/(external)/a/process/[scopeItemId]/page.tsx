/**
 * GET /a/process/[scopeItemId] — L1 process story.
 *
 * Renders the reviewed, chaptered flow (ChapterBand) with the exec story,
 * source attribution, and a Process Navigator deep-link. When there is no
 * reviewed chaptered flow, falls back to the flat <ProcessFlowStrip> inside the
 * same page shell — never a fake narrative. CTA → the L2 affirm questions.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { getGuestProcessPage } from "@/lib/affirm/external/journey";
import { ChapterBand } from "@/components/affirm/external/ChapterBand";
import { ProcessFlowStrip } from "@/components/affirm/ProcessFlowStrip";
import { GuestGuide } from "@/components/affirm/external/GuestGuide";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ scopeItemId: string }>;
}

export default async function AffirmProcessPage({ params }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/a/verify");
  void touchGuestSession(ctx.session.id);

  const { scopeItemId } = await params;
  const page = await getGuestProcessPage(ctx.grant.id, scopeItemId);
  if (!page) redirect("/a/home");

  const story = page.chaptered?.story ?? null;
  const affirmHref = `/a/affirm/${encodeURIComponent(scopeItemId)}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/a/home" className="hover:text-ink">
          Home
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <Link href={`/a/stream/${encodeURIComponent(page.streamId)}`} className="hover:text-ink">
          Stream
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">{page.description}</span>
      </nav>

      <header className="mb-6">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {page.bundle.client}
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink">
          {story?.headline ?? page.description}
        </h1>
        {story && story.outcomeBullets.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {story.outcomeBullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-6 text-ink-soft">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-decision-standard" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </header>

      <GuestGuide id="affirm-exec-process" />

      {page.chaptered ? (
        <>
          <ChapterBand chapters={page.chaptered.chapters} />
          {story && story.integrationNotes.length > 0 && (
            <section className="mt-6 rounded-card-warm border border-border-default bg-cream p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                How this connects
              </p>
              <ul className="space-y-1.5">
                {story.integrationNotes.map((n, i) => (
                  <li key={i} className="text-[13px] leading-5 text-ink-soft">
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <ProcessFlowStrip
          variant="standalone"
          scopeItemId={page.scopeItemId}
          scopeItemDescription={page.description}
          flow={page.flatFlow}
        />
      )}

      {/* Attribution + Process Navigator */}
      <p className="mt-6 text-[11px] leading-5 text-ink-muted">
        Source: {story?.sourceAttribution ?? "SAP Best Practices, S/4HANA Cloud Public Edition 2602"}
        {story?.processNavigatorUrl ? (
          <>
            {" · "}
            <a
              href={story.processNavigatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy hover:underline"
            >
              Open in SAP Process Navigator ↗
            </a>
          </>
        ) : null}
      </p>

      {/* CTA */}
      <div className="mt-6">
        <Link
          href={affirmHref}
          className="inline-flex items-center rounded-input bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-hover"
        >
          Affirm this process
          {page.questionCount > 0 ? ` (${page.questionCount} question${page.questionCount === 1 ? "" : "s"})` : ""}
        </Link>
      </div>
    </main>
  );
}
