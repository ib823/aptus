/**
 * POST /api/studio/clients/write-credential — mint a solution's WRITE key.
 *
 * THE GATE THAT WAS DELIBERATELY SHUT, NOW OPEN — BY OWNER DECISION. The write
 * path shipped complete (grant checklist, environment binding, writeEnabled,
 * idempotency, the ledger) and dead at this gate: `setWriteCredential` and
 * `generateWriteCredential` had no caller, so every northbound write 403'd at
 * the credential check and the entire write control stack ran in production
 * never. The empty write ledger was presented as an honesty demonstration; the
 * owner has decided a WORKING loop whose every control is real and testable is
 * the stronger demonstration, and reversed the hold (remediation plan §3.1).
 *
 * GATES, in order — each refusal names the missing precondition, because a
 * five-gate refusal that says "forbidden" is a guessing game:
 *
 *   1. builder role + tenant scope           (requireBuilder — same as issue)
 *   2. the solution exists in YOUR tenant
 *   3. all three owners are named            (accountability before capability)
 *   4. the issuer is NOT an owner            (SoD — same rule as the read token)
 *   5. a runtime credential exists and is active — the write key seals onto it
 *   6. a LIVE WRITE grant covers the credential's environment: APPROVED (or
 *      SANDBOX_ONLY in SANDBOX), CREATE/UPDATE, unexpired, unrevoked. A write
 *      key with no live write grant would be a secret that authorises nothing
 *      today and something the moment a grant lands — minted before the
 *      second person agreed, which inverts the approval order the whole
 *      ledger exists to enforce.
 *
 * `writeEnabled` on the connection is deliberately NOT checked here: it is a
 * per-tenant runtime veto the broker enforces on every call, and asserting it
 * at issuance would go stale the moment an operator flips it.
 *
 * The raw key is returned ONCE, like the bearer token. Audited as
 * ClientCredential/ISSUE_WRITE.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { generateWriteCredential, setWriteCredential } from "@/lib/northbound/write-credential";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import {
  grantsWrite,
  isWriteOperation,
  type GrantDecision,
  type GrantEnvironment,
  type GrantOperation,
} from "@/lib/studio/grants";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { missingOwners } from "@/lib/studio/solutions";
import { scopedById, scopedWhere, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ solutionId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view credentials but not issue them.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid request.");

  const solution = await prisma.solution.findFirst({
    where: scopedById(scope, parsed.data.solutionId),
    select: {
      id: true,
      name: true,
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
    },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  const missing = missingOwners(solution);
  if (missing.length > 0) {
    return studioError(
      "FORBIDDEN",
      `This solution has no ${missing.join(", ")}. Assign owners before issuing its write key — ` +
        "a write into a client's ledger needs an accountability record more than anything else does.",
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
      "You own this solution, so you cannot issue its write key. Ask a colleague to issue it.",
    );
  }

  // The write key seals onto the solution's runtime credential row.
  const client = await prisma.solutionClient.findFirst({
    where: scopedWhere(scope, { solutionId: solution.id }),
    select: { id: true, environment: true, isActive: true, revokedAt: true },
  });
  if (!client || !client.isActive || client.revokedAt !== null) {
    return studioError(
      "FORBIDDEN",
      "This solution has no active runtime credential. Issue the bearer credential first — the write key is sealed onto it.",
    );
  }

  // A live WRITE grant, evaluated with the same predicates the broker uses.
  const grants = await prisma.apiAccessGrant.findMany({
    where: scopedWhere(scope, { solutionId: solution.id }),
    select: { decision: true, operation: true, environment: true, expiresAt: true, revokedAt: true },
  });
  const now = Date.now();
  const environment = client.environment as GrantEnvironment;
  const hasLiveWriteGrant = grants.some(
    (g) =>
      g.environment === environment &&
      isWriteOperation(g.operation as GrantOperation) &&
      grantsWrite(g.decision as GrantDecision, environment) &&
      g.revokedAt == null &&
      (g.expiresAt === null || g.expiresAt.getTime() > now),
  );
  if (!hasLiveWriteGrant) {
    return studioError(
      "FORBIDDEN",
      `No live write grant covers ${environment} for this solution. A write key is minted only ` +
        "after a second person has approved a CREATE or UPDATE grant for the credential's " +
        "environment — request one in the API Access ledger first.",
    );
  }

  const rawKey = generateWriteCredential();
  const sealed = await setWriteCredential(scope, solution.id, rawKey);
  if (!sealed) return studioError("NOT_FOUND", "Credential not found.");

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "ClientCredential",
    entityId: client.id,
    action: "ISSUE_WRITE",
    // The key itself is absent — the audit records that a write key was
    // issued, never the key.
    after: {
      event: "write_credential_issued",
      clientId: client.id,
      solutionId: solution.id,
      environment: client.environment,
    },
  });

  return studioOk(
    {
      solutionId: solution.id,
      clientId: client.id,
      environment: client.environment,
      writeKey: rawKey,
      warning:
        "Copy this write key now — it is sealed server-side and cannot be shown again. " +
        "Send it as X-CoreEdge-Write-Key alongside the bearer token, from your server only. " +
        "Issuing again replaces it, and the previous key stops working immediately.",
    },
    201,
  );
}
