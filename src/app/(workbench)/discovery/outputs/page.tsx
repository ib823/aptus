/**
 * C9 · Outputs index — /discovery/outputs.
 *
 * Pick an engagement to review and export.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Outputs" };

export default async function OutputsIndexPage() {
  const engagements = await prisma.discoveryEngagement.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, client: true, state: true, _count: { select: { decisions: true } } },
  });

  return (
    <WorkbenchView breadcrumb="Outputs" title="Decisions & outputs">
      {engagements.length === 0 ? (
        <p className="rounded-input border border-border-default bg-paper px-6 py-10 text-center text-[13px] text-ink-soft">
          No engagements yet.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {engagements.map((e) => (
            <li key={e.id}>
              <Link
                href={`/discovery/outputs/${e.id}`}
                className="block rounded-input border border-border-default bg-paper px-4 py-3.5 hover:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
              >
                <span className="block text-[13px] font-semibold text-ink">{e.client}</span>
                <span className="mt-1 block text-[11px] text-ink-soft">
                  {e._count.decisions} decisions · {e.state}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WorkbenchView>
  );
}
