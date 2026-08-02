/**
 * C5 · Sources & capture — /discovery/sources.
 *
 * The P4 pipeline's home. Harvest → triage → generalize → anonymize → review →
 * promote.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { discoveryEngagementScope } from "@/lib/discovery/authz";
import { CaptureWizard, type CaptureRow } from "@/components/discovery/workbench/CaptureWizard";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { findLibraryRow } from "@/lib/discovery/workbench/library";
import { promotedEntries } from "@/lib/discovery/workbench/capture";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Sources & capture" };

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ engagement?: string }>;
}) {
  const { engagement } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  /*
   * THE MOST SENSITIVE READ IN THIS WORKSPACE, AND IT WAS UNSCOPED.
   *
   * A capture is raw harvested material — `rawText` verbatim plus a `clientRef`
   * — captured BEFORE the generalize and anonymize steps that make it fit to
   * promote. `engagementId` is required, so every capture belongs to somebody's
   * client. This listed all of them, and the `?engagement=` parameter was
   * applied without checking whether the caller may see that engagement, so it
   * doubled as a way to read one deliberately.
   *
   * Scoped through the relation rather than by collecting ids first: one query,
   * and the filter cannot be forgotten on a later branch.
   */
  const engagementScope = discoveryEngagementScope(user);

  const [captures, reviewers, promoted, engagements] = await Promise.all([
    prisma.discoveryCapture.findMany({
      where: {
        engagement: engagementScope,
        ...(engagement ? { engagementId: engagement } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        rawText: true,
        linkedProcessId: true,
        status: true,
        promotedAs: true,
      },
    }),
    // The second-reviewer roster is the other consultants with accounts. P4 §9
    // lists "second-reviewer roster named ⟨2 names⟩" as an open prerequisite —
    // until that roster exists, every account is eligible and the gate is simply
    // "someone other than you".
    prisma.user.findMany({
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, email: true },
    }),
    promotedEntries(),
    // The engagement picker for the filter above — the caller's own, or it
    // would offer other consultants' client names as options.
    prisma.discoveryEngagement.findMany({
      where: engagementScope,
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, client: true },
    }),
  ]);

  const rows: CaptureRow[] = captures.map((c) => ({
    ...c,
    linkedProcessName: c.linkedProcessId ? (findLibraryRow(c.linkedProcessId)?.name ?? null) : null,
  }));

  const activeEngagement = engagement ?? engagements[0]?.id ?? null;

  return (
    <WorkbenchView
      breadcrumb="Sources"
      title="Sources & capture"
      caption="Every engagement's differences, generalized and folded back in. Run at engagement close."
    >
      <CaptureWizard
        captures={rows}
        reviewers={reviewers.map((r) => ({ id: r.id, name: r.name ?? r.email ?? "Unknown" }))}
        currentUserId={user?.id ?? ""}
        engagementId={activeEngagement}
      />

      <h2 className="mb-2 mt-8 font-serif text-base font-medium text-navy">Promoted entries</h2>
      {promoted.length === 0 ? (
        <p className="rounded-input border border-border-default bg-paper px-6 py-8 text-center text-[13px] text-ink-soft">
          Nothing promoted yet. Promotions appear in the library badged{" "}
          <span className="font-semibold">client-captured</span>.
        </p>
      ) : (
        <div className="overflow-auto rounded-input border border-border-default bg-paper">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <caption className="sr-only">
              Entries promoted from client captures. These carry no client identity.
            </caption>
            <thead className="bg-ink-tint">
              <tr>
                {["Ref", "Name", "Type", "Observed in", "Seen at", "Visibility"].map((h) => (
                  <th key={h} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promoted.map((p) => (
                <tr key={p.scopeId} className="border-b border-ink-tint">
                  <th scope="row" className="px-3.5 py-3 font-mono text-[11px] font-bold text-navy">{p.scopeId}</th>
                  <td className="px-3.5 py-3 text-xs text-ink">{p.name}</td>
                  <td className="px-3.5 py-3 font-mono text-[11px] text-ink-soft">{p.type}</td>
                  <td className="px-3.5 py-3 text-[11px] text-ink-soft">{p.observedIndustry}</td>
                  <td className="px-3.5 py-3 font-mono text-[11px] text-ink-soft">
                    {p.observedCount} {p.observedCount === 1 ? "client" : "clients"}
                  </td>
                  <td className="px-3.5 py-3">
                    {p.sharedVisible ? (
                      <span className="inline-flex h-5 items-center rounded-pill bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] px-2 text-[10px] font-bold uppercase text-decision-standard">
                        Shared
                      </span>
                    ) : (
                      <span
                        className="inline-flex h-5 items-center rounded-pill bg-banner-warn px-2 text-[10px] font-bold uppercase text-decision-custom"
                        title="Held until a second client shows the same pattern"
                      >
                        Register only
                      </span>
                    )}
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
