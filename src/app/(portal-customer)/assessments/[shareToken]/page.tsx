/**
 * Phase 12 — customer-facing read-only assessment view.
 *
 * Buyer-side stakeholders open this via a signed share link. No login.
 * Read-only by construction: this route only reads; no PATCH/POST routes
 * are exposed under (portal-customer)/.
 */

import { notFound } from "next/navigation";
import { verifyShareLink, ShareLinkInvalid } from "@/lib/auth/share-link";
import { prisma } from "@/lib/db/prisma";

interface Props {
  params: Promise<{ shareToken: string }>;
}

export default async function CustomerAssessmentView({ params }: Props) {
  const { shareToken } = await params;

  let ctx;
  try {
    ctx = await verifyShareLink(shareToken);
  } catch (e) {
    if (e instanceof ShareLinkInvalid) {
      return (
        <div className="max-w-2xl mx-auto p-8">
          <h1 className="text-2xl font-semibold mb-4">Share link unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This share link is {e.reason.toLowerCase()}. Please request a fresh link from your engagement contact.
          </p>
        </div>
      );
    }
    notFound();
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: ctx.assessmentId },
    select: {
      id: true,
      companyName: true,
      industry: true,
      country: true,
      status: true,
      catalogVersion: { select: { version: true, edition: true } },
    },
  });

  if (!assessment) notFound();

  // Bucket counts for the read-only summary view.
  const verdicts = await prisma.classificationVerdict.findMany({
    where: { isCurrent: true, requirement: { assessmentId: ctx.assessmentId } },
    select: { verdict: true },
  });
  const buckets = { O: 0, C: 0, G: 0, "N/A": 0 };
  for (const v of verdicts) {
    if (/^O\b/i.test(v.verdict)) buckets.O++;
    else if (/^C\b/i.test(v.verdict)) buckets.C++;
    else if (/^G\b/i.test(v.verdict)) buckets.G++;
    else if (/^N\/?A\b/i.test(v.verdict)) buckets["N/A"]++;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6 pb-4 border-b border-border">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          Read-only view · {assessment.catalogVersion?.version ?? "—"}/{assessment.catalogVersion?.edition ?? "PUBLIC"}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{assessment.companyName}</h1>
        <div className="text-sm text-muted-foreground mt-1">
          {assessment.industry} · {assessment.country} · {assessment.status}
        </div>
      </header>

      <h2 className="text-lg font-semibold mb-3">Classification Summary</h2>
      <div className="grid grid-cols-4 gap-3">
        <Card label="Out-of-the-Box" value={buckets.O} accent="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <Card label="Configuration" value={buckets.C} accent="bg-amber-50 text-amber-700 border-amber-200" />
        <Card label="Gap" value={buckets.G} accent="bg-rose-50 text-rose-700 border-rose-200" />
        <Card label="Out of Scope" value={buckets["N/A"]} accent="bg-gray-50 text-gray-700 border-gray-200" />
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        Read-only view powered by Aptus. Detailed per-requirement verdicts +
        provenance + report bundle download will land in the Phase-12 frontend
        follow-up.
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-lg border p-4 ${accent}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
