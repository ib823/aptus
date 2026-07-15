/**
 * GET /a/affirm/[scopeItemId] — S7 Affirm (L2).
 *
 * The scope item's questions via the shared DecisionCard/InfoCard
 * (GuestAffirmCards), with calibrated qualitative notes + autosave. Questions
 * group under "General" — there is no reliable question→chapter mapping yet
 * (PR-4); chapter count is context only. Read-only when submitted. Restyled to
 * the Executive Surface design.
 */

import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { getGuestScopeAffirm } from "@/lib/affirm/external/journey";
import { GuestShell } from "@/components/affirm/external/GuestShell";
import { JourneyProgressBar } from "@/components/affirm/external/JourneyProgressBar";
import { GuestAffirmCards } from "@/components/affirm/external/GuestAffirmCards";
import { GuestGuide } from "@/components/affirm/external/GuestGuide";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ scopeItemId: string }>;
}

export default async function AffirmScopeAffirmPage({ params }: PageProps) {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/a/verify");
  void touchGuestSession(ctx.session.id);

  const { scopeItemId } = await params;
  const page = await getGuestScopeAffirm(ctx.grant.id, scopeItemId);
  if (!page) redirect("/a/home");

  const readOnly = page.bundle.state !== "issued";
  const csrf = issueSessionNonce(ctx.session.id);
  const streamHref = `/a/stream/${encodeURIComponent(page.streamId)}`;
  const answeredCount = page.answers.length;

  return (
    <GuestShell
      granteeName={ctx.grant.displayName}
      granteeRole={ctx.grant.roleLabel}
      clientName={page.bundle.client}
    >
      <JourneyProgressBar
        scopeItemId={page.scopeItemId}
        name={page.description}
        answered={answeredCount}
        total={page.questions.length}
        backHref={streamHref}
      />

      <main className="mx-auto max-w-[880px] px-[clamp(16px,4vw,32px)] pb-24 pt-8">
        <h1 className="font-serif text-[30px] font-medium leading-10 text-ink">{page.description}</h1>
        <p className="mt-2 text-[15px] leading-[1.55] text-ink-soft">
          For each question, keep <em>Adopt SAP standard</em> if it works for you, or tell us where
          your business differs.
          {page.chapterTitles.length > 0
            ? ` This process has ${page.chapterTitles.length} chapter${page.chapterTitles.length === 1 ? "" : "s"}.`
            : ""}
        </p>

        {readOnly ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-input border border-navy-border bg-navy-soft px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-navy)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[13px] leading-[19px] text-navy">
              Submitted. Your consultant is preparing the workshop. Answers are read-only.
            </span>
          </div>
        ) : (
          <div className="mt-4">
            <GuestGuide id="affirm-exec-affirm" />
          </div>
        )}

        <div className="mt-4">
          <h2 className="mb-3 border-b border-border-default pb-2 font-serif text-[20px] font-medium text-navy">
            General
          </h2>
          <GuestAffirmCards
            questions={page.questions}
            initialAnswers={page.answers}
            csrfNonce={csrf}
            readOnly={readOnly}
            scopeDescription={page.description}
            backHref={streamHref}
            nextHref={streamHref}
          />
        </div>
      </main>
    </GuestShell>
  );
}
