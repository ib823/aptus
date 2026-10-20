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
 * opens the link and presses Collect, by `claimKey`, on a page that shows it
 * once. This route returns the link and its expiry and nothing else — a key
 * that travelled through an API response would be a key in a log, a proxy and
 * a browser history.
 *
 * SENDING AGAIN REVOKES THE LAST LINK, and that is `createClaimLink`'s own
 * behaviour rather than something added here: one live link per app, feed and
 * environment, with the superseded one revoked rather than deleted. That is
 * what makes "Send a new link" safe to press on an expired one.
 *
 * A LINK IS AN ISSUANCE, so it carries Studio's two gates. Collecting from it
 * mints the same runtime credential POST /api/studio/clients issues, and this
 * route used to check only the sender's role — so a solution's sole owner,
 * refused in Studio with "you cannot issue its runtime credential", could send
 * themselves a link and collect a live PROD key. `claimKey` asks both again at
 * collection, because ownership can change while a link is out.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { requireStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import { refuseSendClaimLink } from "@/lib/coreedge/authz";
import { CLAIM_LINK_COPY, DISABLED_REASONS } from "@/lib/coreedge/copy";
import { LANE_ENVIRONMENTS } from "@/lib/coreedge/lanes";
import { prisma } from "@/lib/db/prisma";
import { createClaimLink } from "@/lib/northbound/claim-link";
import { KeyIssuerRefused, refuseKeyIssuer, type KeyIssuerRefusal } from "@/lib/northbound/issue";
import { writeConfigAudit } from "@/lib/studio/audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  solutionId: z.string().min(1),
  environment: z.enum(LANE_ENVIRONMENTS),
});

function refused(message: string, status: number): NextResponse {
  return NextResponse.json({ error: { message } }, { status });
}

/** The owner gate's refusal, in the lane page's own sentences. */
function issuerRefused(refusal: KeyIssuerRefusal): NextResponse {
  switch (refusal.reason) {
    case "solutionGone":
      return refused("No such app.", 404);
    case "solutionRetired":
      return refused(CLAIM_LINK_COPY.appRetired, 409);
    case "ownersMissing":
      return refused(CLAIM_LINK_COPY.appNeedsOwners, 409);
    case "issuerIsOwner":
      return refused(CLAIM_LINK_COPY.ownAppKey, 403);
  }
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
    select: {
      id: true,
      status: true,
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
    },
  });
  if (solution === null) return refused("No such app.", 404);
  if (solution.status === "RETIRED") {
    // A retired app's keys are refused by northbound anyway; sending a link
    // would deliver a key that cannot work. The same sentence the lane page
    // renders before the press, so the refusal reads identically either way.
    return refused(CLAIM_LINK_COPY.appRetired, 409);
  }

  // Owners first, then the sender is none of them — the order Studio uses, and
  // for its reason: on an unowned app the second check passes for everyone.
  // On LIVE owners (P0.1, A69): a slot whose owner left counts as empty. The
  // same gate runs again inside createClaimLink, under the app lock.
  const issuer = await refuseKeyIssuer(prisma, user.organizationId, solutionId, user.id);
  if (issuer !== null) return issuerRefused(issuer);

  // An issuance, so a fresh passkey too — asked last, once the link would
  // otherwise be sent (lib/auth/step-up.ts).
  const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
    action: "claim_link.send",
    targetId: solutionId,
  });
  if (!stepUp.ok) return stepUp.response;

  let link: Awaited<ReturnType<typeof createClaimLink>>;
  try {
    link = await createClaimLink({
      organizationId: user.organizationId,
      solutionId,
      environment,
      createdById: user.id,
    });
  } catch (err) {
    if (err instanceof KeyIssuerRefused) return issuerRefused(err.refusal);
    throw err;
  }

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
