/**
 * /api/studio/clients — the runtime credential for a solution.
 *
 *   GET    list credential METADATA (never a token)
 *   POST   issue (or re-issue) — returns the raw token ONCE
 *   PATCH  rotate or revoke
 *
 * SEGREGATION OF DUTIES: minting a credential that can read a client's live SAP
 * data is a governance act, not a convenience. The person who OWNS the solution
 * cannot mint its token — someone else must, exactly as a grant requires a
 * second pair of eyes. A developer who could both request access and issue
 * themselves the credential to use it has no oversight at all, which is the
 * whole thing the access ledger exists to provide.
 *
 * A RETIRED SOLUTION GETS NO NEW TOKEN, on issue or on rotate. Its tokens are
 * refused by the broker today, and reactivating it takes one ungated PATCH —
 * so a token minted after retirement would wake up with it, past the gate the
 * write-key route and the claim link both already enforce. Revoke stays open:
 * stopping a credential is never the dangerous direction.
 *
 * ISSUE, ROTATE AND REVOKE ALL NEED A FRESH PASSKEY once COREEDGE_STEP_UP is
 * enforce (lib/auth/step-up.ts), asked after the gates above have passed.
 *
 * OWNERS ARE LIVE OWNERS, AND THE GATE IS RE-RUN UNDER THE APP LOCK (P0.1). An
 * owner who was deactivated or left the organization no longer fills a slot
 * (A69), and the owner gate is applied twice: here, to refuse before asking
 * for a passkey, and again inside the key write's own transaction, holding
 * the Solution row lock an owner reclaim also takes (lib/northbound/issue.ts).
 *
 * KEYS EXPIRE, AND ROTATION OVERLAPS (P0.11, lib/northbound/key-policy.ts). A
 * TEST or PROD key carries an expiry at most 90 days out by default: a PROD
 * issue without `expiresAt` is a 400, a TEST one gets the default, and one
 * past the maximum is a 400. A rotation (PATCH, or a POST over a live key)
 * may name `expiresAt` and otherwise gets the default lifetime, and the key
 * it replaces keeps working until `previousValidUntil` — returned, audited on
 * the ROTATE row, and said in the warning. The expiry is checked before the
 * passkey is asked for, and again in the key write. Revoke ends both keys.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { requireStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import { prisma } from "@/lib/db/prisma";
import {
  issueClientToken,
  KeyExpiryRefused,
  KeyIssuerRefused,
  listClients,
  refuseKeyIssuer,
  revokeClientToken,
  rotateClientToken,
  type KeyIssuerRefusal,
} from "@/lib/northbound/issue";
import { expiryOnRenewal, resolveKeyExpiry, tokenPrefixFor } from "@/lib/northbound/key-policy";
import { isValidSapClient } from "@/lib/sap-public/sap-url";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";
import type { SessionUser } from "@/types/assessment";

export const dynamic = "force-dynamic";

/**
 * The refusal for minting on a retired solution, in the write-key route's
 * words — one decommissioning rule should not read two ways in one product.
 */
function retiredRefusal() {
  return studioError(
    "FORBIDDEN",
    "This solution is RETIRED, so authentication refuses every call it makes. A token " +
      "issued now would authorise nothing today and everything the moment someone reactivates " +
      "the solution. Reactivate it first if the integration is meant to run.",
  );
}

/**
 * The owner gate's refusal, in this route's words. `verb` is what was asked:
 * "issue" or "rotate" — rotating mints a token, so it carries the same gate.
 */
function issuerRefusal(refusal: KeyIssuerRefusal, verb: "issue" | "rotate") {
  switch (refusal.reason) {
    case "solutionGone":
      return studioError("NOT_FOUND", "Solution not found.");
    case "solutionRetired":
      return retiredRefusal();
    case "ownersMissing":
      return studioError(
        "FORBIDDEN",
        verb === "issue"
          ? `This solution has no ${refusal.missing.join(", ")}. Assign owners before issuing a runtime credential — ` +
              "the accountability record is what makes issuing it reviewable." +
              (refusal.departed ? DEPARTED_NOTE : "")
          : `This solution has no ${refusal.missing.join(", ")}. Assign owners before rotating its runtime credential.` +
              (refusal.departed ? DEPARTED_NOTE : ""),
      );
    case "issuerIsOwner":
      return studioError(
        "FORBIDDEN",
        verb === "issue"
          ? "You own this solution, so you cannot issue its runtime credential. Ask a colleague to issue it."
          : "You own this solution, so you cannot rotate its runtime credential. Ask a colleague to rotate it.",
      );
  }
}

/** Why a slot with a name in it can still read as empty. */
const DEPARTED_NOTE =
  " A slot whose owner has been deactivated or has left the organization counts as empty: someone who can still answer for the key must claim it.";

const issueSchema = z
  .object({
    solutionId: z.string().min(1),
    label: z.string().min(1).max(120),
    environment: z.enum(["SANDBOX", "DEV", "TEST", "PROD"]),
    /**
     * The SAP client to bind this credential to. Only meaningful where one
     * landscape holds several data containers (on-premise, RISE) — omit it
     * for public cloud, SuccessFactors and Ariba, which have no SAP client.
     */
    sapClient: z.string().max(3).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((v, ctx) => {
    // A malformed client is worse than none: it silently matches no
    // connection, and the caller sees NO_MATCH_FOR_CLIENT with no hint that
    // the value they typed was never valid.
    if (v.sapClient !== undefined && !isValidSapClient(v.sapClient)) {
      ctx.addIssue({
        code: "custom",
        path: ["sapClient"],
        message: "sapClient must be exactly three digits, e.g. 100",
      });
    }
  });

const patchSchema = z.object({
  clientId: z.string().min(1),
  action: z.enum(["rotate", "revoke"]),
  /**
   * Rotate only: the new key's expiry. Omitted, a TEST or PROD key gets the
   * default lifetime and a SANDBOX or DEV key keeps its current one.
   */
  expiresAt: z.string().datetime().optional(),
});

/** What a replaced key's overlap means, in the words every response uses. */
function overlapSentence(previousValidUntil: Date | null | undefined): string {
  return previousValidUntil == null
    ? "the previous token stopped working immediately"
    : `the previous token keeps working until ${previousValidUntil.toISOString()} so you can deploy this one, and then stops`;
}

interface Actor {
  /** The whole session user: the step-up gate reads its passkey state. */
  user: SessionUser;
  scope: TenantScope;
}

async function requireBuilder(): Promise<{ error: ReturnType<typeof studioError> } | Actor> {
  const user = await getCurrentUser();
  if (!user) return { error: studioError("UNAUTHENTICATED", "Sign in required.") };
  if (!canAccessStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Developer Studio is role-gated.") };
  }
  if (!canMutateStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Your role can view credentials but not issue them.") };
  }
  if (lacksStudioTenantScope(user)) {
    return { error: studioError("FORBIDDEN", "No organization scope.") };
  }
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return { error: studioError("FORBIDDEN", "No organization scope.") };
  return { user, scope: scoped.scope };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioOk({ clients: [] });

  // Metadata only. There is no field in ClientSummary that could carry a token.
  return studioOk({ clients: await listClients(scoped.scope) });
}

export async function POST(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { user, scope } = auth;

  const parsed = issueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid credential request.");
  const input = parsed.data;

  // Re-scope the caller-supplied solutionId.
  const solution = await prisma.solution.findFirst({
    where: scopedById(scope, input.solutionId),
    select: { id: true, name: true },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  // A RETIRED app first, then OWNERSHIP, then segregation of duties — and in
  // that order for a reason. The SoD rule is "the owner cannot mint the token".
  // On a solution with no owners that is VACUOUSLY TRUE: [null, null, null]
  // contains nobody, the check passes, and the person who registered the
  // solution issues themselves a credential to a client's live SAP with no
  // second pair of eyes.
  //
  // Unowned is the DEFAULT state of every newly registered solution, so the way
  // to bypass the control was to skip a step nothing forced you to complete. A
  // governance gate that is disabled by inaction is not a gate.
  //
  // This also matches the rule the product already states elsewhere: a solution
  // cannot be ACTIVE without all three owners. A credential is a stronger thing
  // than ACTIVE status, so it cannot ask for less. And the owners are LIVE ones:
  // an id left behind by someone who has gone counts as no owner (A69).
  const refusal = await refuseKeyIssuer(prisma, scope.organizationId, solution.id, user.id);
  if (refusal !== null) return issuerRefusal(refusal, "issue");

  // Was there already a credential for this solution IN THIS ENVIRONMENT?
  // Read it BEFORE the upsert, because afterwards the row has been overwritten
  // and the question cannot be asked. This is the whole basis of the
  // disclosure below. A credential for another environment is untouched
  // (AD-11): promotion adds a stage, it does not kill the previous one.
  const previous = await prisma.solutionClient.findFirst({
    where: { organizationId: scope.organizationId, solutionId: solution.id, environment: input.environment },
    select: { id: true, environment: true },
  });
  const replacedExisting = previous !== null;

  /*
   * THE EXPIRY, before the passkey (P0.11): a PROD key with no expiry, or a
   * TEST or PROD key past the maximum, is a 400 that names the limit. The
   * key write applies the same rule again (`issueClientToken`).
   */
  const expiry = resolveKeyExpiry({
    environment: input.environment,
    requested: input.expiresAt ? new Date(input.expiresAt) : undefined,
    now: new Date(),
    purpose: "issue",
  });
  if (!expiry.ok) return studioError("VALIDATION_ERROR", expiry.message);

  /*
   * A FRESH PASSKEY, asked last: every gate above has passed, so it is the one
   * thing between this person and a live token (lib/auth/step-up.ts). Named a
   * rotation when it replaces one, because that is what the audit row will say.
   */
  const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
    action: replacedExisting ? "credential.rotate" : "credential.issue",
    targetId: previous?.id ?? solution.id,
  });
  if (!stepUp.ok) return stepUp.response;

  let issued: Awaited<ReturnType<typeof issueClientToken>>;
  try {
    issued = await issueClientToken(
      scope,
      {
        solutionId: solution.id,
        label: input.label,
        environment: input.environment,
        sapClient: input.sapClient ?? null,
        createdById: user.id,
        expiresAt: expiry.expiresAt,
      },
      // Re-applied under the app lock, with the key write (see the header).
      { issuerId: user.id },
    );
  } catch (err) {
    if (err instanceof KeyIssuerRefused) return issuerRefusal(err.refusal, "issue");
    if (err instanceof KeyExpiryRefused) return studioError("VALIDATION_ERROR", err.message);
    throw err;
  }

  /*
   * ITS OWN ENTITY AND ITS OWN VERB.
   *
   * This wrote `entityType: "Solution", action: "UPDATE"` against the SOLUTION's
   * id. So minting a live PROD token against a client's SAP system was recorded
   * as "somebody edited a solution", indistinguishable from a rename. Across 41
   * audit entries there was no credential entity of any kind, so the governance
   * question the trail exists to answer — WHAT DID THIS PERSON ISSUE, so it can
   * be found and revoked — had no field to filter on. Four tokens were minted in
   * one session and left no enumerable record.
   *
   * `replacedExisting` matters as much as the entity does: because issuance
   * upserts, a second call mints a new token and invalidates the live one. The
   * trail has to say which happened, or two very different events look the same
   * afterwards.
   */
  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "ClientCredential",
    entityId: issued.id,
    action: replacedExisting ? "ROTATE" : "ISSUE",
    // The token itself is absent, obviously — the audit records that a credential
    // was issued, never the credential.
    after: {
      event: replacedExisting ? "client_credential_rotated" : "client_credential_issued",
      clientId: issued.id,
      solutionId: solution.id,
      label: input.label,
      environment: issued.environment,
      replacedExisting,
      expiresAt: issued.expiresAt,
      // The overlap end (P0.11): until when the replaced key still worked.
      // Null when nothing live was replaced.
      previousValidUntil: issued.previousValidUntil,
    },
  });

  /*
   * SAY WHEN A LIVE CREDENTIAL WAS REPLACED.
   *
   * Issuance upserts on (solution, environment), so a second call for the same
   * environment returns 201 with the SAME id, mints a fresh token, and
   * INVALIDATES the one in production — while the only warning spoke about
   * copying the token down. A colleague "issuing a credential" could silently
   * kill a working integration. (It used to upsert on the solution alone, so a
   * TEST issue also killed the DEV token and reclassified the credential,
   * voiding the grant that authorised it — AD-11 ended that.)
   *
   * The sibling connections endpoint already returns `replaced` for exactly this
   * reason. The endpoint that mints secrets is the last one that should be
   * quieter than its neighbour.
   */
  return studioOk(
    {
      id: issued.id,
      solutionId: issued.solutionId,
      label: issued.label,
      environment: issued.environment,
      replaced: replacedExisting,
      tokenPrefix: tokenPrefixFor(issued.environment),
      expiresAt: issued.expiresAt,
      previousValidUntil: issued.previousValidUntil,
      // Shown once. The server keeps only a hash and genuinely cannot show it again.
      token: issued.rawToken,
      // The base sentence is unchanged and asserted by tests — a caller that
      // learned to look for it keeps finding it. The replacement disclosure is
      // APPENDED, using the same words the dedicated rotate path uses
      // (`overlapSentence`), because two ways of describing one consequence is
      // how a reader ends up believing they are two things.
      warning:
        "Copy this token now — it is stored only as a hash and cannot be shown again. " +
        "Keep it server-side." +
        (replacedExisting
          ? ` THIS REPLACED THE EXISTING ${issued.environment} CREDENTIAL FOR THIS SOLUTION: ` +
            `${overlapSentence(issued.previousValidUntil)}` +
            (issued.previousValidUntil == null ? ", so anything still using it is failing now. " : ". ") +
            "Credentials for other environments are untouched."
          : ""),
    },
    // STILL 201. A new token genuinely was created, even when the record was
    // reused — the defect was the SILENCE about replacement, not the status
    // code, and changing a published contract to editorialise about it would
    // break callers to make a point.
    201,
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { user, scope } = auth;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid request.");
  const { clientId, action } = parsed.data;
  const requestedExpiry = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined;

  if (action === "revoke") {
    // Deliberately NOT SoD-gated: revoking is the safe direction. Requiring a
    // colleague to stop a leaking credential would be a control that costs
    // exactly when you can least afford it.
    //
    // A passkey, though: it asks this person, not a colleague, so it costs
    // seconds — and without it a stolen session could stop every live token
    // in the tenant.
    const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
      action: "credential.revoke",
      targetId: clientId,
    });
    if (!stepUp.ok) return stepUp.response;

    const revoked = await revokeClientToken(scope, clientId);
    if (!revoked) return studioError("NOT_FOUND", "Credential not found.");

    /*
     * ITS OWN ENTITY AND VERB, same as issuance. The POST path was fixed to
     * ClientCredential/ISSUE precisely because "somebody edited a solution"
     * hid a minting; this branch kept writing Solution/UPDATE, so a REVOCATION
     * — the act an incident response needs to find fastest — stayed
     * unenumerable while the routine acts became searchable.
     */
    await writeConfigAudit({
      organizationId: scope.organizationId,
      actorId: user.id,
      entityType: "ClientCredential",
      entityId: revoked.id,
      action: "REVOKE",
      after: { event: "client_credential_revoked", clientId: revoked.id, solutionId: revoked.solutionId },
    });
    return studioOk({ ...revoked, revoked: true });
  }

  // Rotation mints a working credential, so it carries the same SoD rule as issue.
  const existing = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { id: true, solutionId: true, environment: true, expiresAt: true },
  });
  if (!existing) return studioError("NOT_FOUND", "Credential not found.");

  // Rotating mints a NEW token, so it is an issuance and carries the same
  // gates, on live owners. Without the ownership check the SoD rule is vacuous
  // on an unowned solution — and an owner blocked from issuing could simply
  // rotate instead, which is the same act under a different verb. A missing
  // solution fails closed (solutionGone), never open.
  const refusal = await refuseKeyIssuer(prisma, scope.organizationId, existing.solutionId, user.id);
  if (refusal !== null) return issuerRefusal(refusal, "rotate");

  // The new key's expiry, before the passkey (P0.11) — re-applied in the write.
  const expiry = expiryOnRenewal({
    environment: existing.environment,
    requested: requestedExpiry,
    current: existing.expiresAt,
    now: new Date(),
  });
  if (!expiry.ok) return studioError("VALIDATION_ERROR", expiry.message);

  const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
    action: "credential.rotate",
    targetId: clientId,
  });
  if (!stepUp.ok) return stepUp.response;

  let rotated: Awaited<ReturnType<typeof rotateClientToken>>;
  try {
    rotated = await rotateClientToken(
      scope,
      clientId,
      { issuerId: user.id },
      requestedExpiry === undefined ? {} : { expiresAt: requestedExpiry },
    );
  } catch (err) {
    if (err instanceof KeyIssuerRefused) return issuerRefusal(err.refusal, "rotate");
    if (err instanceof KeyExpiryRefused) return studioError("VALIDATION_ERROR", err.message);
    throw err;
  }
  if (!rotated) return studioError("NOT_FOUND", "Credential not found.");

  // ClientCredential/ROTATE — the verb exists precisely so a rotation (which
  // kills the live token) is distinguishable from a rename. The POST path was
  // fixed; this branch had kept the old Solution/UPDATE shape.
  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "ClientCredential",
    entityId: rotated.id,
    action: "ROTATE",
    after: {
      event: "client_credential_rotated",
      clientId: rotated.id,
      solutionId: rotated.solutionId,
      expiresAt: rotated.expiresAt,
      // The overlap end (P0.11): until when the replaced key still works.
      previousValidUntil: rotated.previousValidUntil,
    },
  });

  return studioOk({
    id: rotated.id,
    solutionId: rotated.solutionId,
    label: rotated.label,
    environment: rotated.environment,
    tokenPrefix: tokenPrefixFor(rotated.environment),
    expiresAt: rotated.expiresAt,
    previousValidUntil: rotated.previousValidUntil,
    token: rotated.rawToken,
    warning:
      `Copy this token now — ${overlapSentence(rotated.previousValidUntil)}. ` +
      "This one is stored only as a hash." +
      (rotated.previousValidUntil != null
        ? " If you rotated because the old token leaked, revoke instead: that ends both at once."
        : ""),
  });
}
