/**
 * /affirm/[id]/output — Screen 4, post-release outputs.
 *
 * Visual: page-head with "Released" pill, AffirmStepper (all done,
 * Output current), "Generated artifacts · N" card with doc-row entries,
 * info-banner reminder that delivery is manual, and a "Move to workshop
 * preparation" card.
 *
 * The signed affirmation record and the workshop agenda are also
 * rendered inline so the consultant can review what's about to be sent
 * before they manually deliver.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { bundleMetadata } from "@/lib/affirm/page-metadata";
import { getCurrentUser } from "@/lib/auth/session";
import { AffirmStepper } from "@/components/affirm/AffirmStepper";
import { ScreenGuide } from "@/components/affirm/learn/ScreenGuide";
import type { AgendaJson, SignedRecordJson, AgendaItem } from "@/lib/affirm/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return bundleMetadata(params, "Output");
}

export default async function OutputPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  const { id } = await params;

  const bundle = await prisma.affirmBundle.findUnique({ where: { id } });
  if (!bundle) notFound();
  if (bundle.state !== "released") redirect(`/affirm/${id}/review`);

  const record = bundle.signedRecordJson as SignedRecordJson | null;
  const agenda = bundle.agendaJson as AgendaJson | null;

  const releasedAt = bundle.releasedAt
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(bundle.releasedAt)
    : "—";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/affirm" className="hover:text-ink">
          Affirmations
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">{bundle.client}</span>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink-soft">Output</span>
      </nav>

      {/* page-head */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {bundle.client}
          </p>
          <h1 className="font-serif text-3xl leading-10 text-ink">Output</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Released {releasedAt} · delivery is manual
          </p>
        </div>
        <span className="inline-flex h-[26px] items-center rounded-pill bg-decision-standard px-3 text-xs font-semibold text-white">
          Released
        </span>
      </header>

      <AffirmStepper current="output" />
      <ScreenGuide />

      {/* info-banner — manual delivery */}
      <div className="mb-6 grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-[#BFD1E3] bg-status-sent-bg px-4 py-3 text-sm leading-5 text-status-sent-fg">
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
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <div>
          <strong className="text-ink">Delivery is manual.</strong> The signed
          affirmation record and workshop agenda are held server-side. There is no
          auto-send &mdash; you deliver both to the client.
        </div>
      </div>

      {/* Generated artefacts */}
      <div
        data-tour="affirm-artefacts"
        className="rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card"
      >
        <header className="mb-3.5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Generated artefacts · {record ? 2 : 0}
              {agenda ? "" : ""}
            </p>
            <h3 className="mt-1 font-serif text-xl text-ink">Downloadable deliverables</h3>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-input border border-navy bg-paper px-3 text-xs font-semibold text-navy hover:bg-navy-soft"
          >
            Download all (zip)
          </button>
        </header>

        <DocRow
          name={`${slugify(bundle.client)}_signed-affirmation-record.json`}
          meta={
            record
              ? `Signed ${releasedAt} · ${record.decisions.length} decision${record.decisions.length === 1 ? "" : "s"}${record.totals.excludedHidden ? ` · ${record.totals.excludedHidden} excluded hidden` : ""}`
              : "Not generated"
          }
          icon="doc"
          size="—"
        />
        <DocRow
          name={`${slugify(bundle.client)}_fit-to-standard-agenda.json`}
          meta={
            agenda
              ? `Fast-confirm ${agenda.fastConfirm.length} · Discuss ${agenda.discuss.length} · Deviations ${agenda.deviations.length}`
              : "Not generated"
          }
          icon="cal"
          size="—"
        />
      </div>

      {/* Signed record inline */}
      <section className="mt-6 overflow-hidden rounded-card-warm border border-border-default bg-paper shadow-card">
        <header className="border-b border-border-default px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Signed affirmation record
          </p>
          <h2 className="mt-1 font-serif text-xl text-ink">The decisions in the wording the client saw</h2>
        </header>

        {record ? (
          <>
            <div className="grid grid-cols-2 divide-x divide-y divide-border-default border-b border-border-default sm:grid-cols-4 sm:divide-y-0">
              <Total label="Adopt standard" value={record.totals.standard} tone="std" />
              <Total label="Discuss" value={record.totals.discuss} tone="cfg" />
              <Total label="Deviations" value={record.totals.deviate} tone="cust" />
              <Total
                label="Excluded (hidden)"
                value={record.totals.excludedHidden}
                tone="muted"
              />
            </div>

            <ul className="divide-y divide-border-default/60">
              {record.decisions.map((d) => (
                <li key={d.questionId} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="flex-1 text-sm text-ink">{d.promptShown}</p>
                    <span
                      className={`shrink-0 rounded-pill px-3 py-0.5 text-xs font-medium ${
                        d.choice === "standard"
                          ? "bg-decision-standard/15 text-decision-standard"
                          : d.choice === "discuss"
                            ? "bg-decision-configure/15 text-decision-configure"
                            : "bg-cta/15 text-cta"
                      }`}
                    >
                      {d.choice}
                    </span>
                  </div>
                  {d.reason && (
                    <div className="mt-2 rounded-input border border-[#E5D6A8] bg-banner-warn px-3 py-2 text-sm text-ink">
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-decision-custom">
                        Reason
                      </span>
                      {d.reason}
                    </div>
                  )}
                  <p className="mt-1 font-mono text-[11px] text-ink-muted">{d.questionId}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="px-6 py-6 text-sm text-ink-muted">Record not available.</p>
        )}
      </section>

      {/* Workshop agenda */}
      <section className="mt-6 overflow-hidden rounded-card-warm border border-border-default bg-paper shadow-card">
        <header className="border-b border-border-default px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Workshop agenda
          </p>
          <h2 className="mt-1 font-serif text-xl text-ink">Fit-to-Standard, pre-sorted</h2>
        </header>

        {agenda ? (
          <>
            <AgendaBlock title="Deviations needing design" tone="cust" items={agenda.deviations} showReason />
            <AgendaBlock title="Discuss in the workshop" tone="cfg" items={agenda.discuss} />
            <AgendaBlock title="Fast-confirm (SAP standard)" tone="std" items={agenda.fastConfirm} />
          </>
        ) : (
          <p className="px-6 py-6 text-sm text-ink-muted">Agenda not available.</p>
        )}
      </section>

      {/* Next card */}
      <div className="mt-6 rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Next</p>
        <h3 className="mt-1 font-serif text-xl text-ink">Move to workshop preparation</h3>
        <p className="mt-2 text-sm text-ink-soft">
          The deviations and discuss items above become the agenda topics for the
          Fit-to-Standard workshop. The pre-onboarding affirmation is closed.
        </p>
        <div className="mt-3.5 flex gap-2.5">
          <Link
            href="/affirm"
            className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover"
          >
            Back to affirmations
          </Link>
        </div>
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function DocRow({
  name,
  meta,
  size,
  icon,
}: {
  name: string;
  meta: string;
  size: string;
  icon: "doc" | "cal";
}) {
  return (
    <div className="mb-2 grid grid-cols-[32px_1fr_auto_auto] items-center gap-4 rounded-card-warm border border-border-default bg-paper px-[18px] py-3.5 last:mb-0">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-md bg-navy-soft text-navy"
      >
        {icon === "doc" ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        )}
      </span>
      <div>
        <div className="font-mono text-sm font-medium text-ink">{name}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{meta}</div>
      </div>
      <div className="font-mono text-xs text-ink-muted">{size}</div>
      <button
        type="button"
        className="inline-flex h-8 items-center rounded-input border border-navy bg-paper px-3 text-xs font-semibold text-navy hover:bg-navy-soft"
      >
        Download
      </button>
    </div>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "std" | "cfg" | "cust" | "muted";
}) {
  const cls =
    tone === "std"
      ? "text-decision-standard"
      : tone === "cfg"
        ? "text-decision-configure"
        : tone === "cust"
          ? "text-decision-custom"
          : "text-ink-muted";
  return (
    <div className="px-6 py-4 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {label}
      </p>
      <p className={`mt-1 font-serif text-2xl tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function AgendaBlock({
  title,
  tone,
  items,
  showReason,
}: {
  title: string;
  tone: "std" | "cfg" | "cust";
  items: AgendaItem[];
  showReason?: boolean;
}) {
  const headCls =
    tone === "cust"
      ? "text-decision-custom"
      : tone === "cfg"
        ? "text-decision-configure"
        : "text-decision-standard";
  return (
    <div className="border-b border-border-default last:border-b-0">
      <h3 className={`bg-cream/50 px-6 py-3 font-serif text-base ${headCls}`}>
        {title} <span className="text-ink-muted">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="px-6 py-4 text-sm text-ink-muted">None.</p>
      ) : (
        <ul className="divide-y divide-border-default/60">
          {items.map((it) => (
            <li key={it.questionId} className="px-6 py-3">
              <p className="text-xs text-ink-muted">
                {it.streamName} · {it.subProcessName}
                {it.sapArea ? ` · ${it.sapArea}` : ""}
              </p>
              <p className="mt-1 text-sm text-ink">
                {it.consultantWording ?? it.plainLanguageSuggested ?? it.sapVerbatim}
              </p>
              {showReason && it.reason && (
                <div className="mt-1 rounded-input border border-[#E5D6A8] bg-banner-warn px-3 py-1.5 text-sm text-ink">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-decision-custom">
                    Reason:
                  </span>
                  {it.reason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
