/**
 * POST: re-check one lane now, because a person pressed the button.
 *
 * A CALLER, NOT A BACKEND. `recheckOneLane` runs the sweep's own per-lane work
 * — same resolver, same probe, same bounded read, same two rows — so a lane
 * checked by hand and a lane checked at 04:30 cannot disagree about what was
 * proven.
 *
 * RATE LIMITED PER LANE, and that is the real gate rather than the role. The
 * button reaches a CLIENT's SAP system: without a limit it is an amplifier
 * pointed at someone else's production estate, and the person holding it need
 * not be acting in bad faith to cause the damage. The key is the lane, not the
 * user, because ten operators hammering one lane is the case that matters.
 *
 * THE LIMITER FAILS CLOSED IN PRODUCTION (see lib/security/rate-limit), which
 * for this route is the right trade in both directions: during a backend
 * outage the nightly sweep still runs, so refusing a manual re-check costs a
 * few hours of freshness and protects the client's system.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { refuseRecheck } from "@/lib/coreedge/authz";
import { DISABLED_REASONS } from "@/lib/coreedge/copy";
import { LANE_ENVIRONMENTS } from "@/lib/coreedge/lanes";
import { recheckOneLane } from "@/lib/ops/lane-check-sweep";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One re-check per lane per minute.
 *
 * Chosen against what the button is for, not against a load target: a person
 * who just fixed something in SAP wants to see it within the minute, and
 * nobody has a reason to ask twice in the same minute.
 */
const RECHECK_LIMIT = { limit: 1, windowMs: 60_000 } as const;

const bodySchema = z.object({
  solutionId: z.string().min(1),
  interfaceId: z.string().min(1),
  environment: z.enum(LANE_ENVIRONMENTS),
});

function refused(message: string, status: number): NextResponse {
  return NextResponse.json({ error: { message } }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return refused("Sign in first.", 401);
  if (user.organizationId === null) return refused(DISABLED_REASONS.noPermission, 403);

  const refusal = refuseRecheck(user.role);
  if (refusal !== null) return refused(DISABLED_REASONS[refusal], 403);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refused("That is not a lane.", 400);
  const { solutionId, interfaceId, environment } = parsed.data;

  const gate = await checkRateLimit(
    // Organization included so one tenant cannot starve another's lane by id.
    `coreedge:recheck:${user.organizationId}:${solutionId}:${interfaceId}:${environment}`,
    RECHECK_LIMIT,
  );
  if (!gate.allowed) {
    return NextResponse.json(
      { error: { message: "Checked a moment ago. Try again shortly." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.resetMs / 1000)) } },
    );
  }

  const outcome = await recheckOneLane(user.organizationId, solutionId, interfaceId, environment);
  /*
   * A SKIP IS NOT AN ERROR, and it is not a 500. The lane has a reason it
   * cannot be checked — no dataset, no system, a secret that will not open —
   * and the screen already has words for each of them.
   */
  return NextResponse.json({ data: outcome });
}
