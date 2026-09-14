/**
 * POST: send a one-time claim link, so a key can actually be collected.
 *
 * WHY THIS ROUTE IS THE WHOLE FIX. `createClaimLink` has been complete since
 * PR-5 and NOTHING called it — repo-wide, its only other appearances are string
 * literals inside a test that reads the file as text. So no KeyClaimLink row
 * could ever be written, the claim page was reachable only by a token nothing
 * produced, and every lane in production read "No key · collect or renew the
 * key" with no way to collect one. The library was not missing. The caller was.
 *
 * THE KEY IS NEVER IN THIS RESPONSE. `createClaimLink` returns a `cec_` CLAIM
 * token, not a `ce_` key; the key itself is minted only when the recipient
 * opens the link, by `claimKey`, on a page that shows it once. This route
 * returns the link and its expiry and nothing else — a key that travelled
 * through an API response would be a key in a log, a proxy and a browser
 * history.
 *
 * SENDING AGAIN REVOKES THE LAST LINK, and that is `createClaimLink`'s own
 * behaviour rather than something added here: one live link per app, feed and
 * environment, with the superseded one revoked rather than deleted. That is
 * what makes "Send a new link" safe to press on an expired one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { refuseSendClaimLink } from "@/lib/coreedge/authz";
import { DISABLED_REASONS } from "@/lib/coreedge/copy";
import { LANE_ENVIRONMENTS } from "@/lib/coreedge/lanes";
import { prisma } from "@/lib/db/prisma";
import { createClaimLink } from "@/lib/northbound/claim-link";
import { writeConfigAudit } from "@/lib/studio/audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  solutionId: z.string().min(1),
  environment: z.enum(LANE_ENVIRONMENTS),
});

function refused(message: string, status: number): NextResponse {
  return NextResponse.json({ error: { message } }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return refused("Sign in first.", 401);
  if (user.organizationId === null) return refused(DISABLED_REASONS.noPermission, 403);

  const refusal = refuseSendClaimLink(user.role);
  if (refusal !== null) return refused(DISABLED_REASONS[refusal], 403);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refused("That is not an app and environment.", 400);
  const { solutionId, environment } = parsed.data;

  // Tenant in the where clause, so another organization's app is not found
  // rather than found and then refused.
  const solution = await prisma.solution.findFirst({
    where: { id: solutionId, organizationId: user.organizationId },
    select: { id: true, status: true },
  });
  if (solution === null) return refused("No such app.", 404);
  if (solution.status === "RETIRED") {
    // A retired app's keys are refused by northbound anyway; sending a link
    // would deliver a key that cannot work.
    return refused("This app is retired, so a key for it would not work.", 409);
  }

  const link = await createClaimLink({
    organizationId: user.organizationId,
    solutionId,
    environment,
    createdById: user.id,
  });

  await writeConfigAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    entityType: "ClientCredential",
    entityId: link.id,
    action: "ISSUE",
    // The token is deliberately absent: an audit row that carried it would be
    // a second place the credential lives, and this one is queryable.
    after: { event: "claim_link_sent", solutionId, environment, expiresAt: link.expiresAt },
  });

  return NextResponse.json({
    data: {
      // The path the recipient opens. Building the absolute URL is the
      // caller's job — it depends on the host the link is delivered from.
      claimPath: `/claim/${link.rawToken}`,
      expiresAt: link.expiresAt,
    },
  });
}
