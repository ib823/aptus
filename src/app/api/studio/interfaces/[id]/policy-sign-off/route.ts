/**
 * /api/studio/interfaces/[id]/policy-sign-off — the SAP API Policy §1.2
 * sign-off for an interface on a customer-built S/4HANA Cloud Public Edition
 * service (roadmap P1.2, studio/api-policy.ts).
 *
 *   POST    record it: { basis, reference, acknowledge: true }
 *   DELETE  withdraw it
 *
 * WHO MAY SIGN (the product owner's Q3, answered by default): a builder of the
 * organisation OTHER THAN THE PERSON WHO CHOSE THE SERVICE — the segregation a
 * grant decision has — per service, behind a passkey step-up. Who chose it is
 * read from the audit trail (serviceRequester): the interface's CREATE row,
 * or the newer edit whose row says it changed the service, since a builder
 * who re-points an interface asks for the new service as surely as its
 * registrant asked for the first (P1.2 review round 1). An interface whose
 * row is missing (the trail was best effort before P1.2) is signed with
 * `requesterUnknown` on the record, so the gap is visible rather than
 * blocking.
 *
 * FAIL CLOSED. The field and its POLICY_SIGN_OFF (or _WITHDRAWN) ConfigAudit
 * row are written in ONE transaction; a sign-off with no trail is not
 * recorded. The update is conditional on the service identity the person was
 * shown, so a path changed meanwhile is never signed by an answer about the
 * old one.
 */

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { checkStepUp, recordStepUpMissing, STEP_UP_MAX_AGE_SECONDS, type StepUpMissing } from "@/lib/auth/step-up";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import {
  API_POLICY_ID,
  currentSignOff,
  policySignOffRequired,
  signOffInputSchema,
  statementText,
  type ApiPolicySignOff,
} from "@/lib/studio/api-policy";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

type Gate =
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; scope: TenantScope; organizationId: string }
  | { ok: false; response: Response };

async function builder(): Promise<Gate> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: studioError("UNAUTHENTICATED", "Sign in required.") };
  if (!canAccessStudio(user.role)) return { ok: false, response: studioError("FORBIDDEN", "Developer Studio is role-gated.") };
  if (!canMutateStudio(user.role)) {
    return { ok: false, response: studioError("FORBIDDEN", "Your role can view interfaces but not sign them off.") };
  }
  if (lacksStudioTenantScope(user)) return { ok: false, response: studioError("FORBIDDEN", "No organization scope.") };
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return { ok: false, response: studioError("FORBIDDEN", "No organization scope.") };
  return { ok: true, user, scope: scoped.scope, organizationId: scoped.scope.organizationId };
}

async function loadInterface(scope: TenantScope, id: string) {
  return prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: { id: true, sapProduct: true, externalId: true, servicePath: true, apiPolicySignOff: true },
  });
}

/**
 * Who asked for the service the interface calls now: the actor of the newest
 * audit row that set its service identity, its CREATE row or an edit whose
 * row says serviceChanged (interfaces/route.ts PATCH, as UPDATE or PROMOTE).
 * Null when that row is missing, or names another service than the interface
 * has now: a change the best-effort trail did not record, whose author is
 * not known.
 */
async function serviceRequester(
  organizationId: string,
  iface: { id: string; externalId: string },
): Promise<{ actorId: string; registered: boolean } | null> {
  const row = await prisma.configAudit.findFirst({
    where: {
      organizationId,
      entityType: "Interface",
      entityId: iface.id,
      OR: [{ action: "CREATE" }, { action: { in: ["UPDATE", "PROMOTE"] }, after: { path: ["serviceChanged"], equals: true } }],
    },
    orderBy: { at: "desc" },
    select: { actorId: true, action: true, after: true },
  });
  if (!row) return null;
  const named = (row.after as { externalId?: unknown } | null)?.externalId;
  if (named !== iface.externalId) return null;
  return { actorId: row.actorId, registered: row.action === "CREATE" };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await builder();
  if (!gate.ok) return gate.response;
  const { user, scope, organizationId } = gate;

  const parsed = signOffInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const reference = parsed.error.issues.find((i) => i.path[0] === "reference");
    return studioError(
      "VALIDATION_ERROR",
      reference?.message ?? "Choose the basis, give its reference where it needs one, and confirm the statement.",
    );
  }
  const input = parsed.data;

  const { id } = await ctx.params;
  const iface = await loadInterface(scope, id);
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");
  if (!policySignOffRequired(iface)) {
    return studioError(
      "VALIDATION_ERROR",
      "This interface needs no SAP API Policy §1.2 sign-off: it does not call a customer-built service on SAP S/4HANA Cloud Public Edition.",
    );
  }

  // Segregation, as a grant decision has it: not the person who chose the service the interface calls.
  const requester = await serviceRequester(organizationId, iface);
  if (requester?.actorId === user.id) {
    return studioError(
      "FORBIDDEN",
      `${requester.registered ? "You registered this interface" : "You chose the service this interface calls"}, so someone else in your organization signs off its SAP API Policy §1.2 basis, as a second person decides its access.`,
    );
  }

  // The passkey last, once every rule has passed (lib/auth/step-up.ts).
  const stepUp = checkStepUp(user, STEP_UP_MAX_AGE_SECONDS, { action: "policy.signoff", targetId: iface.id, organizationId });
  if (!stepUp.ok) return stepUp.response;
  const stepUpMissing: StepUpMissing | null = stepUp.outcome === "warned" ? stepUp.missing : null;

  const signOff: ApiPolicySignOff = {
    policy: API_POLICY_ID,
    serviceIdentity: iface.externalId,
    basis: input.basis,
    reference: input.reference,
    statementHash: createHash("sha256").update(statementText(iface.externalId), "utf8").digest("hex"),
    signedById: user.id,
    signedAt: new Date().toISOString(),
  };
  const recorded = await prisma.$transaction(async (tx) => {
    // Conditional on the service the person was shown: a path changed meanwhile is a new identity.
    const written = await tx.interface.updateMany({
      where: { id: iface.id, organizationId, externalId: iface.externalId },
      data: { apiPolicySignOff: signOff as unknown as Prisma.InputJsonObject },
    });
    if (written.count === 0) return false;
    await tx.configAudit.create({
      data: {
        organizationId,
        actorId: user.id,
        entityType: "Interface",
        entityId: iface.id,
        action: "POLICY_SIGN_OFF",
        ...(iface.apiPolicySignOff ? { before: iface.apiPolicySignOff as Prisma.InputJsonValue } : {}),
        after: { ...signOff, ...(requester ? {} : { requesterUnknown: true }) } as unknown as Prisma.InputJsonObject,
      },
    });
    return true;
  });
  if (!recorded) {
    return studioError("CONFLICT", "This interface's service changed while you were signing. Reload it and sign the service it calls now.");
  }
  if (stepUpMissing) await recordStepUpMissing(stepUpMissing);
  return studioOk({ signOff });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await builder();
  if (!gate.ok) return gate.response;
  const { user, scope, organizationId } = gate;

  const { id } = await ctx.params;
  const iface = await loadInterface(scope, id);
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");
  if (iface.apiPolicySignOff == null) return studioError("NOT_FOUND", "This interface has no sign-off to withdraw.");

  const stepUp = checkStepUp(user, STEP_UP_MAX_AGE_SECONDS, { action: "policy.signoff", targetId: iface.id, organizationId });
  if (!stepUp.ok) return stepUp.response;
  const stepUpMissing: StepUpMissing | null = stepUp.outcome === "warned" ? stepUp.missing : null;

  await prisma.$transaction(async (tx) => {
    await tx.interface.updateMany({
      where: { id: iface.id, organizationId },
      data: { apiPolicySignOff: Prisma.DbNull },
    });
    await tx.configAudit.create({
      data: {
        organizationId,
        actorId: user.id,
        entityType: "Interface",
        entityId: iface.id,
        action: "POLICY_SIGN_OFF_WITHDRAWN",
        before: iface.apiPolicySignOff as Prisma.InputJsonValue,
        after: { withdrawnAt: new Date().toISOString(), wasCurrent: currentSignOff(iface) !== null },
      },
    });
  });
  if (stepUpMissing) await recordStepUpMissing(stepUpMissing);
  return studioOk({ signOff: null });
}
