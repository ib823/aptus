/**
 * C9 · Decisions & outputs — /discovery/outputs/[id].
 *
 * The engagement's review, and the two-lane export. Everything on this page is
 * real: the .dc pre-decides three processes to seed all five of its stat tiles.
 */

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { discoveryEngagementReadable } from "@/lib/discovery/authz";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SummaryBuckets } from "@/components/discovery/SummaryBuckets";
import { TwoLaneExport } from "@/components/discovery/workbench/TwoLaneExport";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { buildClientPack } from "@/lib/discovery/workbench/packs";
import { FIT_LABELS } from "@/lib/discovery/fit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Decisions & outputs" };

export default async function OutputsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  // The engagement's own data. Same rule the API applies; notFound() rather
  // than a redirect so it does not confirm the engagement exists.
  if (!(await discoveryEngagementReadable(id, user))) notFound();
  // C9 reads the CLIENT pack: what the consultant reviews here is exactly what
  // the client would receive, not a parallel rendering of it.
  const pack = await buildClientPack(id);
  if (!pack) notFound();

  const captures = await prisma.discoveryCapture.count({
    where: { engagementId: id, status: "candidate" },
  });

  const items = pack.streams.flatMap((s) => s.processes);
  const buckets = {
    standard: items.filter((p) => p.decision === "standard").map((p) => ({ id: p.id, name: p.name, reason: null })),
    discuss: items.filter((p) => p.decision === "discuss").map((p) => ({ id: p.id, name: p.name, reason: null })),
    differ: items.filter((p) => p.decision === "differ").map((p) => ({ id: p.id, name: p.name, reason: p.reason })),
  };

  const tiles = [
    { v: pack.totals.standard, l: FIT_LABELS.standard, c: "text-decision-standard" },
    { v: pack.totals.discuss, l: FIT_LABELS.discuss, c: "text-decision-configure" },
    { v: pack.totals.differ, l: FIT_LABELS.differ, c: "text-decision-custom" },
    { v: pack.totals.na, l: FIT_LABELS.na, c: "text-ink-soft" },
    { v: pack.processCount, l: "Processes in scope", c: "text-navy" },
  ];

  return (
    <WorkbenchView
      breadcrumb="Outputs"
      title={`${pack.client} — decisions`}
      caption={`${pack.decided} of ${pack.processCount} decided${pack.draft ? " · draft" : ""}`}
      actions={
        <Link
          href={`/discovery/sources?engagement=${id}`}
          className="flex h-[34px] items-center rounded-input border border-border-default bg-paper px-3.5 text-xs font-semibold text-ink-soft hover:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          Capture candidates ({captures})
        </Link>
      }
    >
      <ul className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.l} className="rounded-input border border-border-default bg-paper px-3.5 py-4">
            <p className={`font-serif text-[28px] font-medium ${t.c}`}>{t.v}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase text-ink-soft">{t.l}</p>
          </li>
        ))}
      </ul>

      {pack.incomplete > 0 && (
        <p className="mb-6 rounded-input border border-decision-custom/30 bg-banner-warn px-4 py-3 text-[13px] text-ink-soft">
          <strong className="font-semibold text-decision-custom">
            {pack.incomplete} {pack.incomplete === 1 ? "differ has" : "differs have"} no reason
          </strong>{" "}
          — they cannot be sized, and they cannot be harvested for the library.
        </p>
      )}

      <SummaryBuckets buckets={buckets} />

      <h2 className="mb-1 font-serif text-base font-medium text-navy">Export</h2>
      <TwoLaneExport engagementId={id} />
    </WorkbenchView>
  );
}
