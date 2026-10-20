/**
 * GET /api/control-tower/journey — time to first call and time to first real
 * call (roadmap P2.12), for the caller's organization, or for every
 * organization when the caller is a platform admin with none.
 *
 * Read-only, so no step-up: nothing here changes what anyone may do. The
 * figures are computed from DeveloperJourneyEvent alone (lib/coreedge/
 * journey.ts), a table of first occurrences, so one read covers the window
 * and the payload says when the row cap cut it short.
 */

import { loadJourneySummary } from "@/lib/coreedge/journey";
import { requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  // A global actor reads every organization in the cross-tenant context the
  // guard declared; anyone else reads their own, and only their own.
  const summary = await loadJourneySummary(guard.actor.kind === "scoped" ? guard.actor.organizationId : null);
  return studioOk({ scope: guard.actor.kind, ...summary });
}
