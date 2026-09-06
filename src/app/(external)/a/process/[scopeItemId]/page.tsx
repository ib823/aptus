/**
 * GET /a/process/[scopeItemId] — S6 Process story (L1).
 *
 * The reviewed chaptered flow (ChapterBand) with the exec story, source
 * attribution, and a Process Navigator deep-link. Flat ProcessFlowStrip
 * fallback when there is no reviewed chaptered flow — never a fake narrative.
 * Restyled to the Executive Surface design.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { getGuestProcessPage } from "@/lib/affirm/external/journey";
import { GuestShell } from "@/components/affirm/external/GuestShell";
import { ChapterBand } from "@/components/affirm/external/ChapterBand";
import { JourneyProgressBar } from "@/components/affirm/external/JourneyProgressBar";
import { ProcessFlowStrip } from "@/components/affirm/ProcessFlowStrip";
import { getSapContentRelease } from "@/lib/sap-content/release";
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
  const streamHref = `/a/stream/${encodeURIComponent(page.streamId)}`;
  const allAnswered = page.questionCount > 0 && page.answered >= page.questionCount;

  return (
    <GuestShell
      granteeName={ctx.grant.displayName}
      granteeRole={ctx.grant.roleLabel}
      clientName={page.bundle.client}
    >
      <JourneyProgressBar
        scopeItemId={page.scopeItemId}
        name={page.description}
        answered={page.answered}
        total={page.questionCount}
        backHref={streamHref}
      />

      <main className="mx-auto max-w-[880px] px-[clamp(16px,4vw,32px)] pb-20 pt-8">
        <h1 className="max-w-[22ch] font-serif text-[30px] font-medium leading-10 text-ink">
          {story?.headline ?? page.description}
        </h1>
        {story && story.outcomeBullets.length > 0 && (
          <ul className="mt-4 max-w-[60ch] space-y-1.5">
            {story.outcomeBullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-6 text-ink-soft">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-decision-standard" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <GuestGuide id="affirm-exec-process" />
        </div>

        {page.chaptered ? (
          <>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              How this runs · {page.chaptered.chapters.length} chapter
              {page.chaptered.chapters.length === 1 ? "" : "s"}
            </p>
            <ChapterBand chapters={page.chaptered.chapters} />
            {story && story.integrationNotes.length > 0 && (
              <section className="mt-2 rounded-card-warm border border-border-default bg-cream p-4">
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

        {/* Attribution */}
        <div className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-default pt-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            Source: SAP Best Practices · S/4HANA Cloud Public Edition {getSapContentRelease().release}
          </span>
          {story?.processNavigatorUrl && (
            <a
              href={story.processNavigatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-navy underline"
            >
              Open in SAP Signavio Process Navigator ↗
            </a>
          )}
        </div>

        {/* CTA */}
        <div className="mt-6">
          <Link
            href={affirmHref}
            className={`ax-touch flex h-11 w-full items-center justify-center rounded-input text-[14px] font-semibold transition focus-visible:shadow-focus-ring focus-visible:outline-none ${
              allAnswered
                ? "border border-border-default bg-paper text-ink hover:bg-ink-tint"
                : "bg-cta text-white shadow-card hover:bg-cta-hover"
            }`}
          >
            {allAnswered
              ? "Review your answers ✓"
              : `Affirm this process${page.questionCount > 0 ? ` · ${page.questionCount} question${page.questionCount === 1 ? "" : "s"}` : ""}`}
          </Link>
        </div>
      </main>
    </GuestShell>
  );
}
