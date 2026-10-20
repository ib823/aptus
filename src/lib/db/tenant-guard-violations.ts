/**
 * The durable record of the tenant-scope guard's log-mode burn-in.
 *
 * The guard (lib/db/tenant-guard) counts each unscoped query it lets through
 * in log mode; this writes the count. The switch to TENANT_SCOPE_GUARD=throw
 * is made on seven days with no row seen (docs/runbooks/coreedge-step-up.md),
 * which a console line cannot show: runtime logs are kept for one to three
 * days.
 *
 * One row per model, operation and call site, incremented — not one per query.
 * The client handed in must be the UNEXTENDED one, so that recording a
 * violation is not itself a query the guard judges.
 */

import type { PrismaClient } from "@prisma/client";

import type { TenantGuardViolationRecorder } from "@/lib/db/tenant-guard";

export function tenantGuardViolationRecorder(
  client: Pick<PrismaClient, "tenantGuardViolation">,
): TenantGuardViolationRecorder {
  return async ({ model, operation, callSite, count }) => {
    const now = new Date();
    await client.tenantGuardViolation.upsert({
      where: { model_operation_callSite: { model, operation, callSite } },
      create: { model, operation, callSite, count, firstSeenAt: now, lastSeenAt: now },
      update: { count: { increment: count }, lastSeenAt: now },
    });
  };
}
