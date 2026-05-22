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

export default async function AffirmIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const bundles = await prisma.affirmBundle.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { scopeItems: true, questions: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Pre-onboarding · Fit-to-Standard
          </p>
          <h1 className="font-serif text-3xl leading-10 text-ink">Affirm bundles</h1>
          <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
            Value-stream affirm-set, SAP S/4HANA Cloud Public Edition 2602. 8 streams +
            Foundation, 672 scope items, ~135 client-facing L2 questions. Consultant
            assembles &rarr; client affirms &rarr; consultant releases.
          </p>
        </div>
        <Link
          href="/affirm/new"
          className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover"
        >
          New bundle
        </Link>
      </header>

      {bundles.length === 0 ? (
        <div className="rounded-card-warm border border-border-default bg-paper p-10 text-center shadow-card">
          <p className="font-serif text-xl text-ink">No bundles yet</p>
          <p className="mt-2 text-sm text-ink-muted">
            Start the first affirm-bundle by picking scope items from the value-stream
            tree.
          </p>
          <Link
            href="/affirm/new"
            className="mt-6 inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover"
          >
            Create a bundle
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card-warm border border-border-default bg-paper shadow-card">
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
                      {b._count.questions}
                    </td>
                    <td className="px-5 py-4 text-ink-muted">
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                        b.createdAt,
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={dest}
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
