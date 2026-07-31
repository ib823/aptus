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
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  issueClientToken,
  listClients,
  revokeClientToken,
  rotateClientToken,
} from "@/lib/northbound/issue";
import { isValidSapClient } from "@/lib/sap-public/sap-url";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { missingOwners } from "@/lib/studio/solutions";
import { scopedById, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

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
});

interface Actor {
  user: { id: string; role: string | null };
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
  return { user: { id: user.id, role: user.role }, scope: scoped.scope };
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

  // Re-scope the caller-supplied solutionId, and read its owners for the SoD check.
  const solution = await prisma.solution.findFirst({
    where: scopedById(scope, input.solutionId),
    select: {
      id: true,
      name: true,
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
    },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  // OWNERSHIP FIRST, then segregation of duties — and in that order for a
  // reason. The SoD rule below is "the owner cannot mint the token". On a
  // solution with no owners that is VACUOUSLY TRUE: [null, null, null] contains
  // nobody, the check passes, and the person who registered the solution issues
  // themselves a credential to a client's live SAP with no second pair of eyes.
  //
  // Unowned is the DEFAULT state of every newly registered solution, so the way
  // to bypass the control was to skip a step nothing forced you to complete. A
  // governance gate that is disabled by inaction is not a gate.
  //
  // This also matches the rule the product already states elsewhere: a solution
  // cannot be ACTIVE without all three owners. A credential is a stronger thing
  // than ACTIVE status, so it cannot ask for less.
  const missing = missingOwners(solution);
  if (missing.length > 0) {
    return studioError(
      "FORBIDDEN",
      `This solution has no ${missing.join(", ")}. Assign owners before issuing a runtime credential — ` +
        "the accountability record is what makes issuing it reviewable.",
    );
  }

  // Segregation of duties — see the file header. Meaningful only because the
  // check above guarantees there IS an owner to be distinct from.
  const isOwner = [
    solution.technicalOwnerId,
    solution.businessOwnerId,
    solution.supportOwnerId,
  ].includes(user.id);
  if (isOwner) {
    return studioError(
      "FORBIDDEN",
      "You own this solution, so you cannot issue its runtime credential. Ask a colleague to issue it.",
    );
  }

  // Was there already a credential for this solution? Read it BEFORE the upsert,
  // because afterwards the row has been overwritten and the question cannot be
  // asked. This is the whole basis of the disclosure below.
  const previous = await prisma.solutionClient.findFirst({
    where: { organizationId: scope.organizationId, solutionId: solution.id },
    select: { id: true, environment: true },
  });
  const replacedExisting = previous !== null;
  const previousEnvironment = previous?.environment ?? null;

  const issued = await issueClientToken(scope, {
    solutionId: solution.id,
    label: input.label,
    environment: input.environment,
    sapClient: input.sapClient ?? null,
    createdById: user.id,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

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
      ...(replacedExisting && previousEnvironment !== issued.environment
        ? { environmentChangedFrom: previousEnvironment }
        : {}),
    },
  });

  /*
   * SAY WHEN A LIVE CREDENTIAL WAS REPLACED.
   *
   * Issuance upserts on the solution, so a second call returns 201 with the SAME
   * id, mints a fresh token, and INVALIDATES the one in production — while the
   * only warning spoke about copying the token down. A colleague "issuing a
   * credential" could silently kill a working integration, and if the
   * environment differed it also reclassified the credential, voiding the grant
   * that authorised it.
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
      ...(replacedExisting && previousEnvironment !== issued.environment
        ? { environmentChangedFrom: previousEnvironment }
        : {}),
      // Shown once. The server keeps only a hash and genuinely cannot show it again.
      token: issued.rawToken,
      // The base sentence is unchanged and asserted by tests — a caller that
      // learned to look for it keeps finding it. The replacement disclosure is
      // APPENDED, using the same words the dedicated rotate path already uses
      // ("stopped working immediately"), because two ways of describing one
      // consequence is how a reader ends up believing they are two things.
      warning:
        "Copy this token now — it is stored only as a hash and cannot be shown again. " +
        "Keep it server-side." +
        (replacedExisting
          ? " THIS REPLACED THE EXISTING CREDENTIAL FOR THIS SOLUTION: the previous token " +
            "stopped working immediately, so anything still using it is failing now." +
            (previousEnvironment !== issued.environment
              ? ` Its environment also changed from ${previousEnvironment} to ${issued.environment}, ` +
                `so grants approved for ${previousEnvironment} no longer authorise it.`
              : "")
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

  if (action === "revoke") {
    // Deliberately NOT SoD-gated: revoking is the safe direction. Requiring a
    // colleague to stop a leaking credential would be a control that costs
    // exactly when you can least afford it.
    const revoked = await revokeClientToken(scope, clientId);
    if (!revoked) return studioError("NOT_FOUND", "Credential not found.");

    await writeConfigAudit({
      organizationId: scope.organizationId,
      actorId: user.id,
      entityType: "Solution",
      entityId: revoked.solutionId,
      action: "UPDATE",
      after: { event: "client_credential_revoked", clientId: revoked.id },
    });
    return studioOk({ ...revoked, revoked: true });
  }

  // Rotation mints a working credential, so it carries the same SoD rule as issue.
  const existing = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { id: true, solutionId: true },
  });
  if (!existing) return studioError("NOT_FOUND", "Credential not found.");

  const solution = await prisma.solution.findFirst({
    where: scopedById(scope, existing.solutionId),
    select: { technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
  });

  // Fail closed on a missing solution. The optional chaining below used to make
  // this pass: [undefined, undefined, undefined] contains nobody, so a
  // credential whose solution could not be resolved rotated freely.
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  // Rotating mints a NEW token, so it is an issuance and carries the same two
  // gates. Without the ownership check the SoD rule below is vacuous on an
  // unowned solution — and an owner blocked from issuing could simply rotate
  // instead, which is the same act under a different verb.
  const missingForRotate = missingOwners(solution);
  if (missingForRotate.length > 0) {
    return studioError(
      "FORBIDDEN",
      `This solution has no ${missingForRotate.join(", ")}. Assign owners before rotating its runtime credential.`,
    );
  }

  const isOwner = [
    solution.technicalOwnerId,
    solution.businessOwnerId,
    solution.supportOwnerId,
  ].includes(user.id);
  if (isOwner) {
    return studioError(
      "FORBIDDEN",
      "You own this solution, so you cannot rotate its runtime credential. Ask a colleague to rotate it.",
    );
  }

  const rotated = await rotateClientToken(scope, clientId);
  if (!rotated) return studioError("NOT_FOUND", "Credential not found.");

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Solution",
    entityId: rotated.solutionId,
    action: "UPDATE",
    after: { event: "client_credential_rotated", clientId: rotated.id },
  });

  return studioOk({
    id: rotated.id,
    solutionId: rotated.solutionId,
    label: rotated.label,
    environment: rotated.environment,
    token: rotated.rawToken,
    warning:
      "Copy this token now — the previous one stopped working immediately, and this one is stored only as a hash.",
  });
}
