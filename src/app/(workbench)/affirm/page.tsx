/**
 * /affirm — consultant index of value-stream affirm-bundles.
 *
 * page-head + status pills + a table of bundles. Pulls one row per
 * bundle, newest first, with the counts the consultant cares about.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { countClientFacingQuestions } from "@/lib/affirm/queries";
import { affirmBundleScope } from "@/lib/affirm/authz";
import { ScreenGuide } from "@/components/affirm/learn/ScreenGuide";
import { Term } from "@/components/affirm/learn/TermChip";
import { SampleSandboxCard } from "@/components/affirm/learn/SampleSandboxCard";
import { getSapContentRelease } from "@/lib/sap-content/release";
import { formatDate } from "@/lib/format/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: { absolute: "Affirm bundles — ABeam Workbench" },
};

const PILL_FOR: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-status-draft-bg text-status-draft-fg" },
  issued: { label: "Issued", cls: "bg-status-sent-bg text-status-sent-fg" },
  submitted: {
    label: "Awaiting review",
    cls: "bg-status-awaiting-bg text-status-awaiting-fg",
  },
  released: { label: "Released", cls: "bg-decision-standard text-white" },
};

/** Sort keys the list offers. Kept narrow so the URL stays readable. */
const SORTS = {
  newest: { label: "Newest", orderBy: { createdAt: "desc" } as const },
  oldest: { label: "Oldest", orderBy: { createdAt: "asc" } as const },
  client: { label: "Client A–Z", orderBy: { client: "asc" } as const },
} as const;
type SortKey = keyof typeof SORTS;

const STATES = ["draft", "issued", "submitted", "released"] as const;

interface PageProps {
  searchParams: Promise<{ q?: string; state?: string; sort?: string }>;
}

export default async function AffirmIndexPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  /*
   * SEARCH, FILTER AND SORT — the controls presales has had all along.
   *
   * This list had none, and it holds twenty-two bundles including four
   * variants of "Client2", three of "Client 2", and several obvious test
   * records. Finding a real client meant reading every row.
   *
   * State lives in the URL rather than component state, so a filtered list is
   * shareable, bookmarkable, and survives Back — the pattern presales already
   * uses, and the one Discovery does not.
   */
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const stateFilter = STATES.includes(sp.state as (typeof STATES)[number])
    ? (sp.state as (typeof STATES)[number])
    : null;
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "newest";

  /*
   * SCOPED TO THE CALLER. This listed every bundle from every consultant to any
   * signed-in user — client names, states and counts — and the bundle pages it
   * links to had no authorization either, so the list was a directory of other
   * people's clients and a working set of links into their answers.
   *
   * The rule is the one `requireAffirmBundleAccess` already applied on the API:
   * the consultant who created it, or a platform admin. Expressed here in the
   * `where` rather than filtered afterwards, so the pagination and the totals
   * below count the same set the reader can actually open.
   */
  const visibleToCaller = affirmBundleScope(user);

  const bundles = await prisma.affirmBundle.findMany({
    where: {
      ...visibleToCaller,
      ...(stateFilter ? { state: stateFilter } : {}),
      // Case-insensitive so "acme" finds "Acme Corp".
      ...(q ? { client: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: SORTS[sort].orderBy,
    take: 50,
    include: {
      _count: { select: { scopeItems: true } },
    },
  });
  const totalBundles = await prisma.affirmBundle.count({ where: visibleToCaller });

  // The "Questions" column must be the same number the bundle itself reports.
  // `_count.questions` counted override rows, not the affirm-set — see
  // countClientFacingQuestions.
  const questionCounts = await countClientFacingQuestions(bundles.map((b) => b.id));

  // The training sandbox is offered only on internal-test / workbench-only
  // deployments (matches the /api/affirm/sample gate).
  const sampleEnabled =
    process.env.INTERNAL_TEST_DEPLOYMENT === "true" ||
    process.env.WORKBENCH_ONLY === "true";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Pre-onboarding · Fit-to-Standard
          </p>
          <h1 className="font-serif text-3xl leading-10 text-ink">Affirm bundles</h1>
          <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
            <Term id="affirm-set">Value-stream affirm-set</Term>,{" "}
            <Term id="s4hana-cloud-public">
              SAP S/4HANA Cloud Public Edition {getSapContentRelease().release}
            </Term>
            . 8{" "}
            <Term id="value-stream">streams</Term> + <Term id="foundation">Foundation</Term>,
            679 <Term id="scope-item">scope items</Term>, ~135 client-facing{" "}
            <Term id="l2-question">L2 questions</Term>. Consultant assembles &rarr; client
            affirms &rarr; consultant releases.
          </p>
        </div>
        <Link
          href="/affirm/new"
          data-tour="affirm-new"
          className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover"
        >
          New bundle
        </Link>
      </header>

      <ScreenGuide />
      {sampleEnabled && <SampleSandboxCard />}

      {/* GET form, so every control lands in the URL and Back works. */}
      <form method="GET" className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 basis-[260px]">
          <label htmlFor="affirm-search" className="sr-only">
            Search bundles by client
          </label>
          <input
            id="affirm-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search client…"
            className="h-10 w-full rounded-input border border-border-default bg-paper px-3 text-sm placeholder:text-ink-muted focus:border-navy focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="affirm-state" className="sr-only">
            Filter by state
          </label>
          <select
            id="affirm-state"
            name="state"
            defaultValue={stateFilter ?? ""}
            className="h-10 rounded-input border border-border-default bg-paper px-3 text-sm focus:border-navy focus:outline-none"
          >
            <option value="">All states</option>
            {STATES.map((st) => (
              <option key={st} value={st}>
                {PILL_FOR[st]?.label ?? st}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="affirm-sort" className="sr-only">
            Sort order
          </label>
          <select
            id="affirm-sort"
            name="sort"
            defaultValue={sort}
            className="h-10 rounded-input border border-border-default bg-paper px-3 text-sm focus:border-navy focus:outline-none"
          >
            {Object.entries(SORTS).map(([key, v]) => (
              <option key={key} value={key}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-input border border-navy bg-paper px-4 text-sm font-semibold text-navy transition hover:bg-navy-soft"
        >
          Apply
        </button>
        {(q || stateFilter || sort !== "newest") && (
          <Link
            href="/affirm"
            className="inline-flex h-10 items-center px-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Clear
          </Link>
        )}
        <p className="basis-full text-xs text-ink-muted" role="status">
          {/* Never let a filtered view read as the whole register. */}
          Showing {bundles.length} of {totalBundles} bundle
          {totalBundles === 1 ? "" : "s"}
          {q || stateFilter ? " (filtered)" : ""}
          {totalBundles > 50 && !q && !stateFilter ? " · first 50" : ""}
        </p>
      </form>

      {bundles.length === 0 ? (
        <div
          data-tour="affirm-list"
          className="rounded-card-warm border border-border-default bg-paper p-10 text-center shadow-card"
        >
          <p className="font-serif text-xl text-ink">
            {q || stateFilter ? "No bundles match those filters" : "No bundles yet"}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {q || stateFilter
              ? "An empty result is a statement about the filters, not about the register. Clear them to see everything."
              : "Start the first affirm-bundle by picking scope items from the value-stream tree."}
          </p>
          <Link
            href="/affirm/new"
            className="mt-6 inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover"
          >
            Create a bundle
          </Link>
        </div>
      ) : (
        <div
          data-tour="affirm-list"
          className="overflow-hidden rounded-card-warm border border-border-default bg-paper shadow-card"
        >
          <table className="w-full text-sm">
            <thead className="border-b border-border-default text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Client</th>
                <th className="px-5 py-3 font-semibold">State</th>
                <th className="px-5 py-3 font-semibold">Scope items</th>
                <th className="px-5 py-3 font-semibold">Questions</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const p = PILL_FOR[b.state] ?? PILL_FOR.draft!;
                const dest =
                  b.state === "draft"
                    ? `/affirm/${b.id}/scope`
                    : b.state === "issued" || b.state === "submitted"
                      ? `/affirm/${b.id}/review`
                      : `/affirm/${b.id}/output`;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-border-default/60 last:border-b-0"
                  >
                    <td className="px-5 py-4 font-medium text-ink">{b.client}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex h-[26px] items-center rounded-pill px-3 text-xs font-semibold ${p.cls}`}
                      >
                        {p.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums text-ink-soft">
                      {b._count.scopeItems}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums text-ink-soft">
                      {questionCounts.get(b.id) ?? 0}
                    </td>
                    <td className="px-5 py-4 text-ink-muted">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {/*
                        Every row link was named "Open →", so a screen-reader
                        user pulling up the link list heard the same name 22
                        times with no way to tell the bundles apart. The visible
                        text stays short; the accessible name carries the client.
                      */}
                      <Link
                        href={dest}
                        aria-label={`Open ${b.client}`}
                        className="text-sm font-medium text-navy hover:text-navy-hover"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
