/**
 * What the generated documents need from the database, for a set of
 * interfaces: each one's current compiled contract (snapshot.ts) and the
 * approved, live grants bound to it. One place, so the starter kit and the
 * per-solution OpenAPI cannot read them differently.
 *
 * Grants here are for the DOCUMENT's notes ("granted in DEV, TEST"), never an
 * authorisation: the broker decides access per call (northbound/access.ts).
 * A legacy grant bound to no interface is left out — it is flagged for
 * re-approval where approvers look, and saying it covers an interface here
 * would be the claim P0.1 stopped the broker making.
 */

import type { InterfaceContract } from "@/lib/contracts/ir";
import { currentContractSnapshots } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { grantsRead, grantsWrite, type GrantEnvironment } from "@/lib/studio/grants";
import { scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";
import type { GrantDecision } from "@prisma/client";

export interface CompiledForDoc {
  semver: string;
  snapshotId: string;
  contentHash: string;
  compiledAt: string;
  contract: InterfaceContract;
}

export interface DocInputs {
  compiled: Map<string, CompiledForDoc>;
  grants: Map<string, { operation: string; environment: string }[]>;
}

export async function loadDocInputs(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
  now: Date = new Date(),
): Promise<DocInputs> {
  const snapshots = await currentContractSnapshots(scope, interfaces);
  const compiled = new Map<string, CompiledForDoc>();
  for (const [id, s] of snapshots) {
    compiled.set(id, {
      semver: s.semver,
      snapshotId: s.id,
      contentHash: s.contentHash,
      compiledAt: s.createdAt.toISOString(),
      contract: s.contract,
    });
  }

  const grants = new Map<string, { operation: string; environment: string }[]>();
  if (interfaces.length === 0) return { compiled, grants };
  const rows = await prisma.apiAccessGrant.findMany({
    where: scopedWhere(scope, { interfaceId: { in: interfaces.map((i) => i.id) }, revokedAt: null }),
    select: { interfaceId: true, operation: true, environment: true, decision: true, expiresAt: true },
  });
  for (const i of interfaces) grants.set(i.id, []);
  for (const g of rows) {
    if (!g.interfaceId) continue;
    if (g.expiresAt !== null && g.expiresAt.getTime() <= now.getTime()) continue;
    const env = g.environment as GrantEnvironment;
    const decision = g.decision as GrantDecision;
    const live = g.operation === "READ" ? grantsRead(decision, env) : grantsWrite(decision, env);
    if (live) grants.get(g.interfaceId)?.push({ operation: g.operation, environment: g.environment });
  }
  return { compiled, grants };
}
