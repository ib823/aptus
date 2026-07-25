/**
 * Northbound access control — may THIS client read THIS interface, right now?
 *
 * The chain, and why each link exists:
 *
 *   1. The interface must belong to the token's own SOLUTION. A token is issued
 *      per solution, so an interface belonging to a sibling solution — even in
 *      the same organization — is not this client's to read.
 *   2. It must be organization-scoped. Belt to the braces above, and the layer
 *      that makes a stolen id from another tenant useless.
 *   3. An ApiAccessGrant must be APPROVED for this capability, at this
 *      operation, in this client's ENVIRONMENT. A grant approved for SANDBOX
 *      does not authorise the PROD client, which is the entire point of
 *      recording the environment.
 *   4. The grant must not have expired. Expiry is evaluated at CALL time, not
 *      by a sweep job — otherwise an expired grant keeps working until some
 *      background task happens to run, which makes the expiry date decorative.
 *
 * v1 serves READ only. A WRITE-mode interface is refused here rather than
 * quietly downgraded, because silently turning a write request into a read is a
 * worse surprise than a clear refusal.
 */

import { prisma } from "@/lib/db/prisma";
import { isGranting, type GrantDecision } from "@/lib/studio/grants";
import { scopedById, scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

export interface AccessibleInterface {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  entitySet: string | null;
  operation: string;
  mode: string;
  version: number;
}

export type AccessRefusal =
  | "INTERFACE_NOT_FOUND"
  | "NOT_THIS_SOLUTION"
  | "NO_APPROVED_GRANT"
  | "GRANT_EXPIRED"
  | "WRITE_NOT_SERVED";

export type AccessResult =
  | { ok: true; iface: AccessibleInterface }
  | { ok: false; reason: AccessRefusal; message: string };

export async function resolveReadableInterface(
  scope: TenantScope,
  solutionId: string,
  interfaceId: string,
  environment: string,
  now: Date = new Date(),
): Promise<AccessResult> {
  // Scoped by construction: the id cannot escape the token's organization.
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, interfaceId),
    select: {
      id: true,
      name: true,
      externalId: true,
      sapProduct: true,
      entitySet: true,
      operation: true,
      mode: true,
      version: true,
      solutionId: true,
    },
  });

  if (!iface) {
    return {
      ok: false,
      reason: "INTERFACE_NOT_FOUND",
      message: "No such interface.",
    };
  }

  if (iface.solutionId !== solutionId) {
    // Same message as "not found" on purpose — a client must not be able to
    // discover which interfaces exist outside its own solution.
    return {
      ok: false,
      reason: "NOT_THIS_SOLUTION",
      message: "No such interface.",
    };
  }

  if (iface.mode === "WRITE") {
    return {
      ok: false,
      reason: "WRITE_NOT_SERVED",
      message: "This interface is configured for writes, which this API does not serve.",
    };
  }

  const grants = await prisma.apiAccessGrant.findMany({
    // scopedWhere injects the organization; the rest narrows within it.
    where: scopedWhere(scope, {
      solutionId,
      externalId: iface.externalId,
      operation: iface.operation,
      environment,
    }),
    select: { decision: true, expiresAt: true },
  });

  const granting = grants.filter((g) => isGranting(g.decision as GrantDecision));
  if (granting.length === 0) {
    return {
      ok: false,
      reason: "NO_APPROVED_GRANT",
      message: `No approved access grant for this capability in ${environment}.`,
    };
  }

  // Evaluated at call time: an expired grant must stop working the moment it
  // expires, not whenever a background job next runs.
  const live = granting.filter((g) => g.expiresAt === null || g.expiresAt.getTime() > now.getTime());
  if (live.length === 0) {
    return {
      ok: false,
      reason: "GRANT_EXPIRED",
      message: `The access grant for this capability in ${environment} has expired.`,
    };
  }

  return {
    ok: true,
    iface: {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      entitySet: iface.entitySet,
      operation: iface.operation,
      mode: iface.mode,
      version: iface.version,
    },
  };
}
