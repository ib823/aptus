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
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const issueSchema = z.object({
  solutionId: z.string().min(1),
  label: z.string().min(1).max(120),
  environment: z.enum(["SANDBOX", "DEV", "TEST", "PROD"]),
  expiresAt: z.string().datetime().optional(),
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

  // Segregation of duties — see the file header.
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

  const issued = await issueClientToken(scope, {
    solutionId: solution.id,
    label: input.label,
    environment: input.environment,
    createdById: user.id,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Solution",
    entityId: solution.id,
    action: "UPDATE",
    // The token itself is absent, obviously — the audit records that a credential
    // was issued, never the credential.
    after: {
      event: "client_credential_issued",
      clientId: issued.id,
      environment: issued.environment,
    },
  });

  return studioOk(
    {
      id: issued.id,
      solutionId: issued.solutionId,
      label: issued.label,
      environment: issued.environment,
      // Shown once. The server keeps only a hash and genuinely cannot show it again.
      token: issued.rawToken,
      warning:
        "Copy this token now — it is stored only as a hash and cannot be shown again. Keep it server-side.",
    },
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
  const isOwner = [
    solution?.technicalOwnerId,
    solution?.businessOwnerId,
    solution?.supportOwnerId,
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
