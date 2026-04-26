/**
 * Index route for /assessment/[id] — redirects to a sensible default step.
 *
 * The assessment shell is structured as 5 steps (Profile / Scope / Analyze /
 * Adjust / Export) per spec §8.6, each with its own sub-route. The bare
 * /assessment/[id] URL has no content of its own — visiting it should land
 * on the most relevant step.
 *
 * Heuristic:
 *   - Assessment doesn't exist            → 404
 *   - status = draft                       → /profile (likely needs setup)
 *   - status in {reviewed, completed,
 *                signed_off, handed_off}   → /report (review the deliverable)
 *   - everything else (in-progress)        → /scope (the main work surface)
 */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export default async function AssessmentIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { status: true },
  });

  if (!assessment) {
    notFound();
  }

  const REVIEWED_STATUSES = new Set(["reviewed", "completed", "signed_off", "handed_off"]);
  const target =
    assessment.status === "draft"
      ? `/assessment/${id}/profile`
      : REVIEWED_STATUSES.has(assessment.status)
        ? `/assessment/${id}/report`
        : `/assessment/${id}/scope`;

  redirect(target);
}
