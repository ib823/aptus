/**
 * GET /a/affirm/[scopeItemId] — L2 in-context affirm questions.
 *
 * Renders the scope item's questions via the shared DecisionCard/InfoCard
 * (GuestAffirmCards), with calibrated qualitative notes and autosave. Questions
 * group under "General" — there is no reliable question→chapter mapping yet
 * (that anchoring is deferred to PR-4), so we do NOT guess; chapter count is
 * shown as context only. When the bundle is submitted the surface is read-only.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGuestSession, isDeviceVerified } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { issueSessionNonce } from "@/lib/affirm/external/csrf";
import { getGuestScopeAffirm } from "@/lib/affirm/external/journey";
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/a/home" className="hover:text-ink">
          Home
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <Link href={streamHref} className="hover:text-ink">
          Stream
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <Link href={`/a/process/${encodeURIComponent(scopeItemId)}`} className="hover:text-ink">
          Process
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">Affirm</span>
      </nav>

      <header className="mb-6">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {page.bundle.client}
        </p>
        <h1 className="font-serif text-3xl text-ink">{page.description}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          For each question, keep <em>Adopt SAP standard</em> if it works for you, or tell us where
          your business differs.
          {page.chapterTitles.length > 0
            ? ` This process has ${page.chapterTitles.length} chapter${page.chapterTitles.length === 1 ? "" : "s"}.`
            : ""}
        </p>
      </header>

      {!readOnly && <GuestGuide id="affirm-exec-affirm" />}

      {readOnly && (
        <div className="mb-4 rounded-card-warm border border-[#BFD1E3] bg-status-sent-bg px-4 py-3 text-sm text-status-sent-fg">
          Your answers are sealed — the consultant is reviewing before release.
        </div>
      )}

      <GuestAffirmCards
        questions={page.questions}
        initialAnswers={page.answers}
        csrfNonce={csrf}
        readOnly={readOnly}
        scopeDescription={page.description}
        backHref={streamHref}
        nextHref={streamHref}
      />
    </main>
  );
}
