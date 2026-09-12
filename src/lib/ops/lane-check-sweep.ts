/**
 * The scheduled LANE check sweep — the evidence behind every lane status.
 *
 * WHAT WAS MISSING. `sweepConnectionProbes` proves that a SYSTEM answers. A
 * lane's claim is narrower and stronger: that THIS app can read THIS dataset in
 * THIS environment. Nothing established that, so `listLanes` joined no probe or
 * read evidence at all and every lane derived to `unknown` — correct, and
 * useless. This sweep establishes it.
 *
 * TWO OUTCOMES, RECORDED SEPARATELY, ALWAYS. SAP grants metadata reachability
 * and data readability independently: a communication user can describe a
 * service it is not authorised to read. Collapsing them would send half of all
 * triage to the wrong team, so `probeStatus` and `readStatus` are two columns
 * with two timestamps — and a lane whose metadata is fine but whose read is
 * refused reports exactly that.
 *
 * THE READ IS A REAL READ, BOUNDED TO ONE ROW. `$top=1` is enough to prove
 * readability and is the smallest thing that can. A probe that only described
 * the service would re-introduce the overclaim this sweep exists to remove.
 *
 * A 0-ROW ANSWER IS PROOF, NOT A FAILURE. `EMPTY` means SAP understood the
 * request and had nothing to return — the path works. The handoff is explicit:
 * a 0-row SAP response is gate-info, never an error.
 *
 * THE CONNECTION SWEEP IS UNCHANGED AND STILL RUNS. This one answers a
 * different question and writes different rows; neither replaces the other.
 */

import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { parseLaneEnvironment } from "@/lib/coreedge/lanes";
import { readEntitySet } from "@/lib/northbound/read";
import {
  resolveSapConnections,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { probeConnection, resolveProbePath } from "@/lib/studio/connection-health";

const SWEEP_CONCURRENCY = 4;

/** One row read is all the proof readability needs, and the least SAP must do. */
const PROOF_ROW_LIMIT = 1;

export interface LaneSweepResult {
  readonly checked: number;
  /** Lanes with no active connection for their environment — nothing to probe. */
  readonly skippedNoConnection: number;
  /**
   * Feeds with no entity set. There is no read to attempt, so no readability
   * claim can be established either way — recorded as skipped rather than
   * written as a failure that would blame SAP for a feed nobody finished.
   */
  readonly skippedNoEntitySet: number;
  /** Connections whose stored secret would not open. */
  readonly unreadable: number;
  readonly byReadStatus: Readonly<Record<string, number>>;
}

/**
 * Map the northbound read status onto the ledger's vocabulary.
 *
 * `NEEDS_SETUP` becomes ERROR rather than a status of its own: from a lane's
 * point of view a service path that cannot be built is a CoreEdge-side fault,
 * and the ledger's job is to say whether the read worked, not to carry a
 * second taxonomy. A 403 arrives as ERROR with httpStatus 403, so it is mapped
 * explicitly — FORBIDDEN and ERROR have different owners.
 */
export function ledgerReadStatus(status: string, httpStatus: number | null): string {
  if (status === "OK" || status === "EMPTY" || status === "NOT_FOUND" || status === "TIMEOUT") {
    return status;
  }
  if (httpStatus === 403) return "FORBIDDEN";
  if (httpStatus === 401) return "UNAUTHORIZED";
  return "ERROR";
}

interface LaneTarget {
  readonly organizationId: string;
  readonly solutionId: string;
  readonly interfaceId: string;
  readonly environment: string;
  readonly product: string;
  readonly externalId: string;
  /**
   * Non-null by construction. A feed with no entity set has nothing to read, so
   * it is not a checkable lane — see the filter in `laneTargets`.
   */
  readonly entitySet: string;
}

/**
 * Every lane worth checking: an ACTIVE app's feed, in an environment where an
 * active SAP connection claims to serve it.
 *
 * A lane with no connection is not checked and not recorded as failing. There
 * is nothing to ask, and writing a failure would blame SAP for a binding that
 * nobody has made — the derivation already renders that case from the binding
 * facts it has.
 */
async function laneTargets(): Promise<{
  readonly targets: readonly LaneTarget[];
  readonly skippedNoConnection: number;
  readonly skippedNoEntitySet: number;
}> {
  const [solutions, connections] = await Promise.all([
    prisma.solution.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        organizationId: true,
        interfaces: {
          select: { id: true, sapProduct: true, externalId: true, entitySet: true },
        },
      },
    }),
    prisma.sapConnection.findMany({
      where: { isActive: true },
      select: { id: true, organizationId: true, environment: true },
    }),
  ]);

  const environmentsByOrg = new Map<string, Set<string>>();
  for (const c of connections) {
    const env = parseLaneEnvironment(c.environment);
    if (env === null) continue;
    const set = environmentsByOrg.get(c.organizationId) ?? new Set<string>();
    set.add(env);
    environmentsByOrg.set(c.organizationId, set);
  }

  const targets: LaneTarget[] = [];
  let skippedNoConnection = 0;
  let skippedNoEntitySet = 0;

  for (const solution of solutions) {
    const environments = environmentsByOrg.get(solution.organizationId) ?? new Set<string>();
    for (const feed of solution.interfaces) {
      const entitySet = feed.entitySet;
      if (entitySet === null || entitySet === "") {
        skippedNoEntitySet++;
        continue;
      }
      for (const environment of ["SANDBOX", "DEV", "TEST", "PROD"]) {
        if (!environments.has(environment)) {
          skippedNoConnection++;
          continue;
        }
        targets.push({
          organizationId: solution.organizationId,
          solutionId: solution.id,
          interfaceId: feed.id,
          environment,
          product: feed.sapProduct,
          externalId: feed.externalId,
          entitySet,
        });
      }
    }
  }

  return { targets, skippedNoConnection, skippedNoEntitySet };
}

/**
 * Probe and read every active lane, recording both outcomes.
 *
 * Writes the per-lane ledger AND SapServiceHealth. The two are not redundant:
 * the ledger answers "can this app read this dataset here", the matrix answers
 * "what does this system currently serve", and the SAP systems screen reads the
 * second. PR-5 created SapServiceHealth and nothing wrote it; this does.
 */
export async function sweepLaneChecks(now: Date = new Date()): Promise<LaneSweepResult> {
  // Fleet-wide by design, like the connection sweep it runs beside.
  permitCrossTenantReads("lane-check-sweep: fleet-wide scheduled lane probe");

  const { targets, skippedNoConnection, skippedNoEntitySet } = await laneTargets();

  const result = {
    checked: 0,
    skippedNoConnection,
    skippedNoEntitySet,
    unreadable: 0,
    byReadStatus: {} as Record<string, number>,
  };

  // Grouped by (org, product) so secrets open through the same resolver every
  // other read path uses, and resolved once per group rather than per lane.
  const groups = new Map<string, LaneTarget[]>();
  for (const t of targets) {
    const key = `${t.organizationId}::${t.product}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  for (const [groupKey, groupTargets] of groups) {
    const [organizationId, product] = groupKey.split("::") as [string, string];
    let resolved: ResolvedSapConnection[];
    try {
      resolved = await resolveSapConnections(organizationId, product);
    } catch {
      // The secret would not open. No probe ran, so there is no tenant fact to
      // record — the same rule probeOneConnection follows.
      result.unreadable += groupTargets.length;
      continue;
    }

    const byEnvironment = new Map<string, ResolvedSapConnection>();
    for (const c of resolved) {
      const env = parseLaneEnvironment(c.environment ?? null);
      if (env !== null) byEnvironment.set(env, c);
    }

    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < groupTargets.length) {
        const target = groupTargets[cursor++];
        if (!target) continue;
        const connection = byEnvironment.get(target.environment);
        if (!connection) {
          result.skippedNoConnection++;
          continue;
        }
        await checkOneLane(target, connection, now, result);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(SWEEP_CONCURRENCY, groupTargets.length) }, worker),
    );
  }

  return result;
}

async function checkOneLane(
  target: LaneTarget,
  connection: ResolvedSapConnection,
  now: Date,
  result: { checked: number; byReadStatus: Record<string, number> },
): Promise<void> {
  // 1 · Metadata reachability, through the same probe the Studio test uses.
  const probeStatus = resolveProbePath(connection)
    ? (await probeConnection(connection)).status
    : null;

  // 2 · Data readability — a real read, bounded to one row. Attempted even when
  // the probe failed, because the two facts are independent and a lane whose
  // metadata call was refused may still read, or vice versa. Recording only one
  // of them would be the merge this sweep exists to avoid.
  const read = await readEntitySet({
    connection,
    servicePath: target.externalId,
    entitySet: target.entitySet,
    limit: PROOF_ROW_LIMIT,
  });
  const readStatus = ledgerReadStatus(read.status, read.httpStatus);

  result.checked++;
  result.byReadStatus[readStatus] = (result.byReadStatus[readStatus] ?? 0) + 1;

  const ledger = {
    organizationId: target.organizationId,
    solutionId: target.solutionId,
    interfaceId: target.interfaceId,
    environment: target.environment,
    connectionId: connection.id,
    probeStatus,
    probeAt: probeStatus === null ? null : now,
    readStatus,
    readAt: now,
    readRowCount: read.records.length,
  };

  await prisma.laneCheck.upsert({
    where: {
      solutionId_interfaceId_environment: {
        solutionId: target.solutionId,
        interfaceId: target.interfaceId,
        environment: target.environment,
      },
    },
    create: ledger,
    update: ledger,
  });

  // The per-service matrix the SAP systems screen reads. Keyed by service, not
  // by lane: several apps can read the same service through one system.
  await prisma.sapServiceHealth.upsert({
    where: {
      connectionId_serviceName_entitySet: {
        connectionId: connection.id,
        serviceName: target.externalId,
        entitySet: target.entitySet,
      },
    },
    create: {
      organizationId: target.organizationId,
      connectionId: connection.id,
      serviceName: target.externalId,
      entitySet: target.entitySet,
      metadataStatus: probeStatus,
      metadataAt: probeStatus === null ? null : now,
      readStatus,
      readAt: now,
      readRowCount: read.records.length,
    },
    update: {
      metadataStatus: probeStatus,
      metadataAt: probeStatus === null ? null : now,
      readStatus,
      readAt: now,
      readRowCount: read.records.length,
    },
  });
}
