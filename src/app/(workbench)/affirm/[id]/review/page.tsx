/**
 * /affirm/[id]/review — Screen 3, the consultant review-and-release gate.
 *
 * Visual: page-head with eyebrow + serif H1 + sub + status pill ·
 * AffirmStepper · "Affirmation summary" card (kv-grid) · info-banner
 * "Client answers are sealed" · Deviations card (compact affirm-cards
 * with client reason) · Discuss card · note-banner for flagged
 * questions · sticky release-bar at the bottom.
 *
 * State-dependent flow:
 *   - draft     : IssueButton (no review content yet)
 *   - issued    : "Awaiting client" panel + snapshot for context
 *   - submitted : full review + Release control
 *   - released  : redirect to /output
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getAffirmSetForBundle,
  getCoverageForBundle,
} from "@/lib/affirm/queries";
import { AffirmStepper } from "@/components/affirm/AffirmStepper";
import { LifecycleStepper, type BundleLifecycle } from "@/components/affirm/LifecycleStepper";
import { BadgeLegend } from "@/components/affirm/BadgeLegend";
import { ReleaseBar } from "@/components/affirm/ReleaseBar";
import { ScreenGuide } from "@/components/affirm/learn/ScreenGuide";
import { GrantsPanel, type GrantClient } from "@/components/affirm/GrantsPanel";
import { listGrantsForBundle } from "@/lib/affirm/external/grants";
import { isAffirmExternalEnabled } from "@/lib/affirm/external/guards";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const PILL_FOR: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "bg-status-draft-bg", fg: "text-status-draft-fg" },
  issued: { label: "Issued — awaiting client", bg: "bg-status-sent-bg", fg: "text-status-sent-fg" },
  submitted: {
    label: "Awaiting your release",
    bg: "bg-status-awaiting-bg",
    fg: "text-status-awaiting-fg",
  },
};

export default async function ReviewPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  const { id } = await params;

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id },
    include: {
      _count: { select: { scopeItems: true, questions: true } },
      responses: {
        select: { questionId: true, choice: true, reason: true, answeredAt: true },
      },
    },
  });
  if (!bundle) notFound();
  if (bundle.state === "released") redirect(`/affirm/${id}/output`);

  const questions = await getAffirmSetForBundle(id, { forClient: false });
  const coverage = await getCoverageForBundle(id);
  const responseById = new Map(bundle.responses.map((r) => [r.questionId, r]));

  const clientFacing = questions.filter((q) => q.status !== "excluded");
  const excluded = questions.filter((q) => q.status === "excluded");
  const flagged = clientFacing.filter((q) => q.flag === "config-how-to");
  const pendingPlainLanguage = clientFacing.filter(
    (q) => q.status !== "confirmed",
  );

  const deviations = clientFacing.filter(
    (q) => responseById.get(q.id)?.choice === "deviate",
  );
  const discuss = clientFacing.filter(
    (q) => responseById.get(q.id)?.choice === "discuss",
  );
  const standards = clientFacing.filter(
    (q) =>
      responseById.get(q.id)?.choice === "standard" ||
      (!responseById.has(q.id) && bundle.state === "submitted"),
  );

  const streamNames = Array.from(new Set(clientFacing.map((q) => q.streamName)));
  const streamDisplay =
    streamNames.length === 0
      ? "(no in-scope questions)"
      : streamNames.length === 1
        ? streamNames[0]!
        : `${streamNames.length} value streams`;

  const pill = PILL_FOR[bundle.state];

  // Affirm external executive journey (PR-1). The grants panel appears on
  // client-facing bundles when the feature flag is on. Streams come from the
  // in-scope questions so the multi-select is scoped to this bundle.
  const externalEnabled = isAffirmExternalEnabled();
  const showGrantsPanel =
    externalEnabled && (bundle.state === "issued" || bundle.state === "submitted");
  const grantStreams = Array.from(
    new Map(clientFacing.map((q) => [q.streamId, q.streamName])).entries(),
  ).map(([id, name]) => ({ id, name }));
  const initialGrants: GrantClient[] = showGrantsPanel
    ? (await listGrantsForBundle(id)).map((g) => ({
        id: g.id,
        email: g.email,
        displayName: g.displayName,
        roleLabel: g.roleLabel,
        valueStreamIds: g.valueStreamIds,
        status: g.status,
        answered: g.answered,
        total: g.total,
      }))
    : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/affirm" className="hover:text-ink">
          Affirmations
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">{bundle.client}</span>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink-soft">Review</span>
      </nav>

      {/* page-head */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {bundle.client} · {streamDisplay}
          </p>
          <h1 className="font-serif text-3xl leading-10 text-ink">Review &amp; release</h1>
          <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
            {bundle.state === "submitted"
              ? `Submitted${
                  bundle.submittedAt
                    ? ` ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(bundle.submittedAt)}`
                    : ""
                } · ${bundle.responses.length} of ${clientFacing.length} answered`
              : bundle.state === "issued"
                ? `Issued · ${bundle.responses.length} of ${clientFacing.length} answered so far`
                : `Draft · ${coverage.totalScopeItems} scope items selected`}
          </p>
        </div>
        {pill && (
          <span
            className={`inline-flex h-[26px] items-center rounded-pill px-3 text-xs font-semibold ${pill.bg} ${pill.fg}`}
          >
            {pill.label}
          </span>
        )}
      </header>

      <AffirmStepper
        current={
          bundle.state === "draft"
            ? "editor"
            : bundle.state === "issued"
              ? "affirm"
              : "review"
        }
      />
      <ScreenGuide />

      {/* v2 §6: bundle lifecycle stepper */}
      <div className="mb-6" data-tour="affirm-review-summary">
        <LifecycleStepper
          current={bundle.state as BundleLifecycle}
          meta={bundle.id}
          caption={
            bundle.state === "draft"
              ? "The bundle is being assembled. Open the question editor to review the in-scope L2 set, then issue to the client."
              : bundle.state === "issued"
                ? "The bundle is live with the client. The client is answering; nothing reaches the workshop until they submit and you release."
                : bundle.state === "submitted"
                  ? `The client has answered all ${clientFacing.length} questions; it is now yours to review and release. Nothing is sent back to them until you act.`
                  : "Released. The signed record and workshop agenda are produced."
          }
        />
      </div>

      {showGrantsPanel && (
        <GrantsPanel bundleId={id} streams={grantStreams} initialGrants={initialGrants} />
      )}

      {/* Coverage stat-strip */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={coverage.totalScopeItems} l="Scope items" />
        <Stat n={coverage.itemsWithBdc} l="With BDC L2" tone="std" />
        <Stat n={coverage.itemsWithoutBdc} l="No affirm-set" tone="cust" />
        <Stat n={coverage.pendingCuration} l="Pending curation" tone="cust" />
      </section>

      {/* Caveat banner */}
      {(excluded.length > 0 || flagged.length > 0 || pendingPlainLanguage.length > 0) && (
        <div className="mb-6 grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-[#E5D6A8] bg-banner-warn px-4 py-3.5 text-sm leading-5 text-ink-soft">
          <svg
            className="mt-px text-[#8B5A00]"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <div>
            <strong className="text-ink">Release-candidate caveats.</strong>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {excluded.length > 0 && (
                <li>
                  <span className="font-semibold text-ink">{excluded.length}</span>{" "}
                  excluded rows are hidden from the client view (mistagged config rows /
                  no usable question text in the SAP source).
                </li>
              )}
              {flagged.length > 0 && (
                <li>
                  <span className="font-semibold text-ink">{flagged.length}</span>{" "}
                  questions are flagged as configuration how-to rather than business
                  decisions — review whether they belong in the pre-workshop set.
                </li>
              )}
              {pendingPlainLanguage.length > 0 && (
                <li>
                  <span className="font-semibold text-ink">
                    {pendingPlainLanguage.length}
                  </span>{" "}
                  questions still use the suggested plain-language draft (status =
                  suggested). The consultant confirm pass is pending.
                </li>
              )}
              <li>
                The BDC questionnaires are ~2024 vintage. Re-verification against live
                SAP 2602 is the mandatory gate before any client-facing launch.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* DRAFT state: send the consultant to the question editor; the
          editor owns the "Issue to client" CTA in v2 (CCC follow-up §4). */}
      {bundle.state === "draft" && (
        <div className="rounded-card-warm border border-navy bg-navy-soft px-[22px] py-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-navy">
            Draft bundle
          </p>
          <h3 className="mt-1 font-serif text-lg text-ink">
            {coverage.totalScopeItems} scope items · {clientFacing.length}{" "}
            in-scope question{clientFacing.length === 1 ? "" : "s"}
          </h3>
          <p className="mt-1.5 text-sm text-ink-soft">
            Continue to the question editor to review wording, format
            (Decision / Information), and order before issuing to the client.
          </p>
          <div className="mt-3.5 flex gap-2.5">
            <Link
              href={`/affirm/${id}/questions`}
              className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover"
            >
              Open question editor
            </Link>
            <Link
              href={`/affirm/${id}/scope`}
              className="inline-flex h-10 items-center rounded-input border border-border-default bg-paper px-4 text-sm font-semibold text-ink hover:bg-ink-tint"
            >
              Edit scope
            </Link>
          </div>
        </div>
      )}

      {/* ISSUED state: waiting */}
      {bundle.state === "issued" && (
        <div className="rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Awaiting client
              </p>
              <h3 className="mt-1 font-serif text-xl text-ink">
                The bundle is live with the client
              </h3>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/affirm/${id}/questions`}
                className="inline-flex h-8 items-center rounded-input border border-border-default bg-paper px-3 text-xs font-semibold text-ink-soft hover:bg-ink-tint"
              >
                Edit questions
              </Link>
              <Link
                href={`/affirm/${id}`}
                className="inline-flex h-8 items-center rounded-input border border-navy bg-paper px-3 text-xs font-semibold text-navy hover:bg-navy-soft"
              >
                Open client view
              </Link>
            </div>
          </div>
          <p className="text-sm text-ink-soft">
            Once the client submits their answers, this screen unlocks the release
            control. Answered so far:{" "}
            <span className="font-semibold text-ink">
              {bundle.responses.length} / {clientFacing.length}
            </span>
            .
          </p>
        </div>
      )}

      {/* SUBMITTED state: review + release */}
      {bundle.state === "submitted" && (
        <>
          {/* Affirmation summary card */}
          <div className="rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card">
            <header className="mb-3.5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Affirmation summary
                </p>
                <h3 className="mt-1 font-serif text-xl text-ink">What the client chose</h3>
              </div>
            </header>
            <dl className="grid grid-cols-2 gap-x-7 gap-y-4 md:grid-cols-3">
              <KV k="Client" v={bundle.client} />
              <KV k="Value stream" v={streamDisplay} />
              <KV
                k="Submitted"
                v={
                  bundle.submittedAt
                    ? new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(bundle.submittedAt)
                    : "—"
                }
              />
              <KV
                k="Questions answered"
                v={`${bundle.responses.length} of ${clientFacing.length}`}
              />
              <KV
                k="Adopt standard"
                v={`${pct(standards.length, clientFacing.length)}% · ${standards.length} items`}
                tone="std"
              />
              <KV
                k="Deviations & discuss"
                v={`${deviations.length + discuss.length} items`}
                tone="cust"
              />
            </dl>
          </div>

          {/* v2 §6: badge legend */}
          <div className="mt-4">
            <BadgeLegend />
          </div>

          {/* info-banner: sealed */}
          <div className="mt-4 grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-[#BFD1E3] bg-status-sent-bg px-4 py-3 text-sm leading-5 text-status-sent-fg">
            <svg
              className="mt-px"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <strong className="text-ink">Client answers are sealed.</strong> SAP
              verbatim text is retained on every item for audit. You can request
              clarification but cannot edit the answers directly.
            </div>
          </div>

          {/* Deviations */}
          <ReviewCard
            eyebrow={`Deviations · ${deviations.length} item${deviations.length === 1 ? "" : "s"}`}
            title='"We do this differently"'
            caption="Each carries the client's reason — these become the design topics for the workshop."
            empty="No deviations — the client is adopting SAP standard everywhere."
            questions={deviations}
            responses={responseById}
            showReason
          />

          {/* Discuss */}
          <ReviewCard
            eyebrow={`Workshop discussion · ${discuss.length} item${discuss.length === 1 ? "" : "s"}`}
            title='"Discuss in workshop"'
            empty="No 'discuss' picks."
            questions={discuss}
            responses={responseById}
          />

          {/* note-banner for flagged */}
          {flagged.length > 0 && (
            <div className="mt-4 grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-[#E5D6A8] bg-banner-warn px-4 py-3.5 text-sm leading-5 text-ink-soft">
              <svg
                className="mt-px text-[#8B5A00]"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              <div>
                <strong className="text-ink">
                  {flagged.length} flagged question
                  {flagged.length === 1 ? "" : "s"} need your call.
                </strong>{" "}
                These are phrased by SAP as configuration setup steps rather than
                business decisions. They were shown to the client but flagged — decide
                whether they belong in the pre-workshop set or move to the Explore
                workshops before you release.
              </div>
            </div>
          )}

          <ReleaseBar
            bundleId={id}
            totals={{
              fastConfirm: standards.length,
              discuss: discuss.length,
              deviations: deviations.length,
            }}
          />
        </>
      )}
    </div>
  );
}

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

function Stat({
  n,
  l,
  tone,
}: {
  n: number;
  l: string;
  tone?: "std" | "cfg" | "cust";
}) {
  const cls =
    tone === "std"
      ? "text-decision-standard"
      : tone === "cfg"
        ? "text-decision-configure"
        : tone === "cust"
          ? "text-decision-custom"
          : "text-ink";
  return (
    <div className="rounded-card-warm border border-border-default bg-paper px-[18px] py-3.5">
      <p className={`font-serif text-[28px] leading-none font-medium ${cls}`}>{n}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {l}
      </p>
    </div>
  );
}

function KV({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "std" | "cfg" | "cust";
}) {
  const cls =
    tone === "std"
      ? "text-decision-standard"
      : tone === "cfg"
        ? "text-decision-configure"
        : tone === "cust"
          ? "text-decision-custom"
          : "text-ink";
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {k}
      </p>
      <p className={`mt-1 text-[15px] font-medium ${cls}`}>{v}</p>
    </div>
  );
}

type QuestionRow = Awaited<ReturnType<typeof getAffirmSetForBundle>>[number];

function ReviewCard({
  eyebrow,
  title,
  caption,
  empty,
  questions,
  responses,
  showReason,
}: {
  eyebrow: string;
  title: string;
  caption?: string;
  empty: string;
  questions: QuestionRow[];
  responses: Map<
    string,
    { questionId: string; choice: string; reason: string | null; answeredAt: Date }
  >;
  showReason?: boolean;
}) {
  return (
    <div className="mt-4 rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card">
      <header className="mb-3.5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {eyebrow}
          </p>
          <h3 className="mt-1 font-serif text-xl text-ink">{title}</h3>
        </div>
        {caption && <span className="max-w-xs text-xs text-ink-muted">{caption}</span>}
      </header>

      {questions.length === 0 ? (
        <p className="rounded-input bg-ink-tint px-4 py-3 text-sm text-ink-muted">
          {empty}
        </p>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q) => {
            const r = responses.get(q.id);
            return (
              <article
                key={q.id}
                className="rounded-card-warm border border-border-default bg-paper px-[18px] py-3.5"
              >
                <header className="mb-2 flex items-center gap-2.5">
                  <span className="text-sm font-semibold text-ink-soft">
                    {q.sapTopic ?? q.sapArea ?? "General"}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-ink-muted">
                    {q.id}
                  </span>
                </header>
                <p className="mb-2 text-sm text-ink">
                  {q.consultantWording ?? q.plainLanguageSuggested ?? q.sapVerbatim}
                </p>
                <p className="font-mono text-[11px] text-ink-muted">
                  SAP BDC · Level 2{q.sapArea ? ` · ${q.sapArea}` : ""}
                  {q.sscuiRef && q.sscuiRef !== "-" && q.sscuiRef !== "N/A"
                    ? ` · ${q.sscuiRef}`
                    : ""}
                </p>
                {showReason && r?.reason && (
                  <div className="mt-2.5 rounded-input border border-[#E5D6A8] bg-banner-warn px-3.5 py-2.5 text-[13px] leading-[19px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-decision-custom">
                      Client&apos;s reason
                    </span>
                    <span className="text-ink">{r.reason}</span>
                  </div>
                )}
                {q.flag === "config-how-to" && (
                  <div className="mt-2.5 grid grid-cols-[16px_1fr] gap-2 rounded-input bg-banner-warn px-3 py-2 text-xs leading-[18px] text-ink-soft">
                    <svg
                      className="mt-0.5 text-[#8B5A00]"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4M12 17h.01" />
                    </svg>
                    <div>
                      <strong className="text-ink">
                        Flagged as L3 configuration.
                      </strong>{" "}
                      Decide whether this belongs in the pre-workshop set.
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
