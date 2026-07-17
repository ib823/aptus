/**
 * C1 · Workbench home — /discovery.
 *
 * Built from brief §7-C1 ALONE: the .dc has no C1, only a stub reading "Pass 2/3
 * of the consultant workbench build."
 *
 * "greeting + library-health tiles + an engagements table (client · streams ·
 * reviewers · status · last activity · open) + quick actions ('Curate library',
 * 'New session', 'Work the gaps'). States: populated; first-run empty ('Import
 * the base library' CTA); skeleton."
 *
 * The first-run empty state is NOT reachable and is deliberately not built: the
 * library is a committed JSON file, so it is never absent. An "Import the base
 * library" CTA would be a button that cannot do anything — D17.
 *
 * The engagements table reads the PR-2a tables. An engagement with no reviewers
 * shows an honest zero; there are no fixture rows.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { libraryHealth } from "@/lib/discovery/workbench/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: { absolute: "Process Discovery — ABeam Workbench" } };

const QUICK_ACTIONS = [
  { href: "/discovery/library", label: "Curate library" },
  { href: "/discovery/coverage", label: "Work the gaps" },
];

function ago(d: Date, now: Date): string {
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

export default async function DiscoveryHomePage() {
  const user = await getCurrentUser();
  const h = libraryHealth();
  const now = new Date();

  const engagements = await prisma.discoveryEngagement.findMany({
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      client: true,
      state: true,
      updatedAt: true,
      _count: { select: { grants: true, decisions: true } },
    },
  });

  return (
    <WorkbenchView
      breadcrumb="Home"
      title={`Process Discovery${user?.name ? ` — ${user.name}` : ""}`}
      caption="Curate the neutral library, govern its coverage, and run client discovery."
      actions={QUICK_ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex h-[34px] items-center rounded-input border border-border-default bg-paper px-3.5 text-xs font-semibold text-ink-soft hover:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          {a.label}
        </Link>
      ))}
    >
      {/* Library-health tiles (component 11) — computed sources only. */}
      <ul className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { v: String(h.processes), l: "Processes", href: "/discovery/library" },
          { v: `${Math.round(h.flowShare * 100)}%`, l: "With a step flow", href: "/discovery/library" },
          { v: `${h.gapCategories}/${h.apqcCategories}`, l: "APQC gap categories", href: "/discovery/coverage" },
          { v: `${h.ageDays}d`, l: "Since last refresh", href: "/discovery/health" },
        ].map((t) => (
          <li key={t.l}>
            <Link
              href={t.href}
              className="block rounded-input border border-border-default bg-paper px-3.5 py-4 hover:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
            >
              <span className="block font-serif text-2xl font-medium text-navy">{t.v}</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase text-ink-muted">{t.l}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mb-2.5 font-serif text-base font-medium text-navy">Engagements</h2>
      {engagements.length === 0 ? (
        // Honest empty. Not "Import the base library" (D17) — the library is
        // committed and present; there is nothing to import.
        <p className="rounded-input border border-border-default bg-paper px-6 py-10 text-center text-[13px] text-ink-muted">
          No discovery engagements yet. Sessions arrive in the next pass — the library above is
          ready to curate in the meantime.
        </p>
      ) : (
        <div className="overflow-auto rounded-input border border-border-default bg-paper">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">Discovery engagements, most recently updated first.</caption>
            <thead className="bg-ink-tint">
              <tr>
                {["Client", "Reviewers", "Decisions", "Status", "Last activity"].map((c) => (
                  <th key={c} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr key={e.id} className="border-b border-ink-tint">
                  <th scope="row" className="px-3.5 py-3 text-xs font-semibold text-ink">{e.client}</th>
                  <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">{e._count.grants}</td>
                  <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">{e._count.decisions}</td>
                  <td className="px-3.5 py-3">
                    <span className="inline-flex h-5 items-center rounded-pill bg-ink-tint px-2 text-[10px] font-bold uppercase text-ink-soft">
                      {e.state}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-[11px] text-ink-muted">{ago(e.updatedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkbenchView>
  );
}
