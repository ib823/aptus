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

import { LIMITS } from "@/lib/contracts/budget";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { currentSnapshotSummaries, snapshotContracts } from "@/lib/contracts/snapshot";
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
  /** Its canonical bytes: what its read path's budget is a function of (budget.ts). */
  irBytes: number;
}

export interface DocInputs {
  ok: true;
  compiled: Map<string, CompiledForDoc>;
  grants: Map<string, { operation: string; environment: string }[]>;
}

export interface DocInputsTooLarge {
  ok: false;
  reason: "TOO_LARGE";
  /** The contracts' canonical bytes, added up as far as the budget was passed. */
  bytes: number;
  limit: number;
}

/**
 * THE RENDER BUDGET OF ONE DOCUMENT: the canonical bytes of all the compiled
 * contracts it carries, added up. MAX_CONTRACT_BYTES bounds ONE snapshot;
 * nothing bounded a solution's sixteen of them, and its document — 1.2 GB of
 * RSS to build — then threw RangeError: Invalid string length on a read path,
 * an uncaught 500 (hostile-input review round 1). Past this budget the reader
 * refuses (TOO_LARGE) before any IR is read, from the sizes kept at record
 * time. Every document is linear in the contracts it carries, so the budget
 * bounds the render; what it buys, measured and asserted in
 * tests/unit/contracts/hostile-input.test.ts ("rendered documents stay inside
 * a stated bound"), at the worst shapes rather than ordinary ones. A stored
 * contract's own bound (MAX_CONTRACT_BYTES), so any one contract the verify
 * accepted renders on every read path; a real dataset's slice is tens of
 * kilobytes, so a solution of dozens of them renders.
 *
 * It is the input side of the documents' budget (budget.ts, LIMITS.document):
 * the output side is the bytes the document is then written in, charged as
 * they are written (documentLimit, kitLimit), against the same function of
 * each contract's size that the record measured it against in the envelope.
 */
export const MAX_DOCUMENT_CONTRACT_BYTES = LIMITS.document.contractsCap;

/** The refusal of a document past its budget: what to do about it, never the contract itself. */
export function documentTooLargeMessage(what: "starter kit" | "solution document", limit: number): string {
  return `The compiled contracts this ${what} would carry are larger than the ${Math.floor(limit / (1024 * 1024))} MB a generated document may carry, so it was not built. Narrow the interfaces' datasets, or split the solution, and verify again.`;
}

/** The refusal of a document whose output passed its budget while it was written (budget.ts). */
export function documentOutputTooLargeMessage(what: "starter kit" | "solution document", limit: number): string {
  return `This ${what} would be larger than the ${Math.max(1, Math.floor(limit / (1024 * 1024)))} MB its contracts allow it to be, so it was not built. Narrow the interfaces' datasets, or split the solution, and verify again.`;
}

export async function loadDocInputs(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
  opts: { now?: Date; maxContractBytes?: number } = {},
): Promise<DocInputs | DocInputsTooLarge> {
  const now = opts.now ?? new Date();
  const limit = opts.maxContractBytes ?? MAX_DOCUMENT_CONTRACT_BYTES;
  const summaries = await currentSnapshotSummaries(scope, interfaces);
  // Before any IR is read: the sizes kept at record time.
  let known = 0;
  for (const s of summaries.values()) {
    known += s.irBytes ?? 0;
    if (known > limit) return { ok: false, reason: "TOO_LARGE", bytes: known, limit };
  }
  const snapshots = await snapshotContracts(scope, summaries);
  // And with the rows that predate the kept size, measured now.
  let total = 0;
  for (const s of snapshots.values()) total += s.irBytes;
  if (total > limit) return { ok: false, reason: "TOO_LARGE", bytes: total, limit };
  const compiled = new Map<string, CompiledForDoc>();
  for (const [id, s] of snapshots) {
    compiled.set(id, {
      semver: s.semver,
      snapshotId: s.id,
      contentHash: s.contentHash,
      compiledAt: s.createdAt.toISOString(),
      contract: s.contract,
      irBytes: s.irBytes,
    });
  }

  const grants = new Map<string, { operation: string; environment: string }[]>();
  if (interfaces.length === 0) return { ok: true, compiled, grants };
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
  return { ok: true, compiled, grants };
}
