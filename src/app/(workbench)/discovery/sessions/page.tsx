/**
 * C7 · Sessions — /discovery/sessions.
 *
 * The engagements list. No fabricated rows: the .dc ships three invented
 * reviewers with working-looking emails at asiameals.my and a hardcoded client
 * name; none of it ships.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const engagements = await prisma.discoveryEngagement.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      client: true,
      state: true,
      liveAt: true,
      valueStreamIds: true,
      updatedAt: true,
      _count: { select: { grants: true, decisions: true } },
    },
  });

  return (
    <WorkbenchView
      breadcrumb="Sessions"
      title="Discovery sessions"
      caption="A session scopes the library to the streams this client cares about, and invites their reviewers."
      actions={
        <Link
          href="/discovery/sessions/new"
          className="flex h-[34px] items-center rounded-input bg-cta px-3.5 text-xs font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          New session
        </Link>
      }
    >
      {engagements.length === 0 ? (
        <p className="rounded-input border border-border-default bg-paper px-6 py-10 text-center text-[13px] text-ink-soft">
          No sessions yet. Create one to scope the library and invite the client&apos;s reviewers.
        </p>
      ) : (
        <div className="overflow-auto rounded-input border border-border-default bg-paper">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">Discovery sessions, most recently updated first.</caption>
            <thead className="bg-ink-tint">
              <tr>
                {["Client", "Scope", "Reviewers", "Decisions", "Status", "Open"].map((h) => (
                  <th key={h} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr key={e.id} className="border-b border-ink-tint">
                  <th scope="row" className="px-3.5 py-3 text-xs font-semibold text-ink">{e.client}</th>
                  <td className="px-3.5 py-3 text-[11px] text-ink-soft">
                    {e.valueStreamIds.length === 0
                      ? "All 10 streams"
                      : `${e.valueStreamIds.length} of 10 streams`}
                  </td>
                  <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">{e._count.grants}</td>
                  <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">{e._count.decisions}</td>
                  <td className="px-3.5 py-3">
                    {e.liveAt ? (
                      <span className="inline-flex h-5 items-center gap-1.5 rounded-pill bg-cta-focus px-2 text-[10px] font-bold uppercase text-cta">
                        <span className="size-1.5 rounded-pill bg-cta" aria-hidden="true" />
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex h-5 items-center rounded-pill bg-ink-tint px-2 text-[10px] font-bold uppercase text-ink-soft">
                        {e.state}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <Link
                      href={`/discovery/sessions/${e.id}`}
                      className="text-xs font-semibold text-navy underline-offset-2 hover:underline focus-visible:shadow-focus-ring focus-visible:outline-none"
                    >
                      Open<span className="sr-only"> session for {e.client}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkbenchView>
  );
}
