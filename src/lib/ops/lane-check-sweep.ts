/**
 * The LANE check sweep — the evidence behind every lane status.
 *
 * ITS CALLER IS GET /api/cron/lane-checks, nightly at 04:30 UTC per vercel.json.
 * Naming the caller is the point: this header said "scheduled" for a release in
 * which nothing called this function at all, so the ledger stayed empty and
 * every lane in production rendered "never checked". A sweep with no caller is
 * not a sweep, and a comment is not a schedule.
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

import type { Prisma } from "@prisma/client";

import {
  laneAuthorisation,
  type LaneConnection,
  type LaneCredentialRow,
  type LaneGrantRow,
} from "@/lib/coreedge/lane-authorisation";
import {
  isLaneCheckedApp,
  LANE_CHECKED_APP_STATUSES,
  LANE_ENVIRONMENTS,
  parseLaneEnvironment,
  type LaneEnvironment,
  type LEDGER_READ_STATUSES,
} from "@/lib/coreedge/lanes";
import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { GRANT_SELECT, READABLE_INTERFACE_SELECT } from "@/lib/northbound/access";
import type { AuthorisableInterface, BindingEstate } from "@/lib/northbound/authorisation";
import { loadBindingEstate } from "@/lib/northbound/binding";
import { readEntitySet } from "@/lib/northbound/read";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { resolveInterfaceService } from "@/lib/sap-public/interface-service";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
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
  /**
   * Feeds whose service the broker cannot resolve for their product. The broker
   * refuses every call on such a feed, so there is nothing a read could prove —
   * and a failure recorded against SAP would blame the client for our config.
   */
  readonly skippedNoService: number;
  /**
   * Lanes the broker refuses on access (authorisesHere, P0.2): no grant
   * authorises them here, or the feed is deprecated, a draft writer or an
   * update. Nothing a read could prove would make them callable, and an "OK"
   * written for one is how the board came to show them Live (A14).
   */
  readonly skippedNoAccess: number;
  /** Lanes whose product's stored connection secret would not open. */
  readonly unreadable: number;
  /**
   * Lanes read, and their answer discarded, because their connection was
   * re-saved while the read ran (`recordLaneCheck`): the answer was about the
   * previous settings. Counted in `checked` and `byReadStatus` too, since SAP
   * was asked; the next check records the new settings' answer.
   */
  readonly discardedConnectionChanged: number;
  readonly byReadStatus: Readonly<Record<string, number>>;
}

/**
 * The service path a lane's feed resolves to — THE BROKER'S RESOLUTION, not a
 * second one.
 *
 * `externalId` is a catalogue id (`API_BUSINESS_PARTNER`), not a path. This
 * sweep passed it to `readEntitySet` as `servicePath` directly, so every lane
 * check requested `https://<host>API_BUSINESS_PARTNER/...` — a different
 * hostname — and no lane could ever be proven by the sweep. Resolving through
 * `resolveInterfaceService` (the feed's own path, else `resolveHubService`)
 * means a lane is checked against exactly the path the broker would call, and
 * a feed the broker would refuse is skipped as one.
 *
 * Exported so the lane board asks the same question when it explains a skip
 * (`SweepFacts.feedServiceResolves`): one function, so the two cannot disagree.
 */
export async function resolveLaneServicePath(
  product: string,
  externalId: string,
  /**
   * The feed's OWN service root, when it carries one. Resolved through the
   * same `resolveInterfaceService` the broker calls, so a custom feed is
   * checked on its own path and a catalogue feed exactly as before.
   */
  servicePath: string | null = null,
  odataVersion: string | null = null,
): Promise<string | null> {
  const sapProduct = getSapProduct(product);
  if (sapProduct === null) return null;
  const resolved = await resolveInterfaceService(sapProduct, {
    sapProduct: product,
    externalId,
    servicePath,
    odataVersion,
  });
  return resolved?.service.path ?? null;
}

/**
 * One key per distinct service a feed names — product, catalogue id, and the
 * feed's own path and version. Shared by the sweep's memo and the lane board,
 * so the two cannot key the same feed differently. Ids now contain `:` (the
 * `custom:` prefix), so nothing may split this key back apart.
 */
export function laneServiceKey(feed: {
  readonly product: string;
  readonly externalId: string;
  readonly servicePath: string | null;
  readonly odataVersion: string | null;
}): string {
  return `${feed.product}::${feed.externalId}::${feed.servicePath ?? ""}::${feed.odataVersion ?? ""}`;
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
export function ledgerReadStatus(
  status: string,
  httpStatus: number | null,
): (typeof LEDGER_READ_STATUSES)[number] {
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
  /** The feed's own service root, or null for a catalogue feed. */
  readonly servicePath: string | null;
  readonly odataVersion: string | null;
  /**
   * Non-null by construction. A feed with no entity set has nothing to read, so
   * it is not a checkable lane — see `planLaneCheck`.
   */
  readonly entitySet: string;
  /** The feed's version when it was checked: the evidence is keyed by it (A18). */
  readonly interfaceVersion: number;
}

/** Why the sweep — or a person's Re-check — does not read SAP for a lane. */
export type LaneCheckSkip = "appNotLive" | "noEntitySet" | "accessRefused" | "unreadable" | "noConnection";

/** The rows `planLaneCheck` judges one lane on. */
export interface LaneCheckPlanInput<C extends LaneConnection> {
  readonly solutionStatus: string;
  readonly feed: AuthorisableInterface;
  readonly environment: LaneEnvironment;
  /** The solution's grants, newest first. */
  readonly grants: readonly LaneGrantRow[];
  readonly credential: LaneCredentialRow | null;
  readonly estate: BindingEstate<C>;
  readonly now: Date;
}

/**
 * Should SAP be read for this lane, and through which connection? THE ONE
 * PLAN the nightly sweep and a person's Re-check both follow, in this order:
 *
 *   1. appNotLive     — only apps that carry traffic (ACTIVE, RESTRICTED). A
 *                       retired or draft app's lane is not read on demand
 *                       either (A70): retiring an app stops its reads.
 *   2. noEntitySet    — there is no read to attempt.
 *   3. accessRefused  — the broker refuses the lane's access (authorisesHere):
 *                       the sweep used to write fresh "OK" evidence for lanes
 *                       nobody may call, which is how the board came to show
 *                       them Live (A14).
 *   4. unreadable / noConnection — the broker would bind no connection
 *                       (bindingFor, on the feed's product, with the lane's
 *                       credential's SAP client). The sweep used to read
 *                       through whichever connection declared the
 *                       environment, whatever its product or client (A15).
 *
 * The service is resolved after, by the caller: it is asynchronous.
 */
export function planLaneCheck<C extends LaneConnection>(
  input: LaneCheckPlanInput<C>,
): { readonly ok: true; readonly connection: C } | { readonly ok: false; readonly skipped: LaneCheckSkip } {
  if (!isLaneCheckedApp(input.solutionStatus)) return { ok: false, skipped: "appNotLive" };
  if (input.feed.entitySet === null || input.feed.entitySet === "") return { ok: false, skipped: "noEntitySet" };
  const auth = laneAuthorisation({
    iface: input.feed,
    solutionId: input.feed.solutionId,
    environment: input.environment,
    grants: input.grants,
    credential: input.credential,
    estate: input.estate,
    now: input.now,
  });
  if (auth.access.refusal !== null) return { ok: false, skipped: "accessRefused" };
  if (auth.bound === null) {
    return { ok: false, skipped: auth.binding.refusal === "CONNECTION_UNREADABLE" ? "unreadable" : "noConnection" };
  }
  return { ok: true, connection: auth.bound };
}

/** The interface fields the plan and the ledger need. */
const FEED_SELECT = { ...READABLE_INTERFACE_SELECT } as const;

/**
 * The credential fields the plan needs: its environment and SAP client, which
 * the binding is made with. Never the sealed write key — the plan does not
 * judge keys (a lane with no key is still worth proving for the day it gets
 * one), and Ops code never names that column in a select.
 */
const CREDENTIAL_SELECT = {
  solutionId: true,
  environment: true,
  sapClient: true,
  isActive: true,
  revokedAt: true,
  expiresAt: true,
} as const;

function credentialFor(
  clients: readonly {
    solutionId: string;
    environment: string;
    sapClient: string | null;
    isActive: boolean;
    revokedAt: Date | null;
    expiresAt: Date | null;
  }[],
  solutionId: string,
  environment: LaneEnvironment,
): LaneCredentialRow | null {
  const c = clients.find((x) => x.solutionId === solutionId && parseLaneEnvironment(x.environment) === environment);
  return c === undefined
    ? null
    : {
        environment: c.environment,
        sapClient: c.sapClient,
        isActive: c.isActive,
        revokedAt: c.revokedAt,
        expiresAt: c.expiresAt,
        // Not read here, and not judged by the plan (see above).
        writeKeyIssued: false,
      };
}

function targetOf(
  organizationId: string,
  feed: AuthorisableInterface,
  environment: LaneEnvironment,
): LaneTarget {
  return {
    organizationId,
    solutionId: feed.solutionId,
    interfaceId: feed.id,
    environment,
    product: feed.sapProduct,
    externalId: feed.externalId,
    servicePath: feed.servicePath ?? null,
    odataVersion: feed.odataVersion ?? null,
    entitySet: feed.entitySet ?? "",
    interfaceVersion: feed.version,
  };
}

/**
 * Probe and read every lane the broker would serve, recording both outcomes.
 *
 * Writes the per-lane ledger AND SapServiceHealth. The two are not redundant:
 * the ledger answers "can this app read this dataset here", the matrix answers
 * "what does this system currently serve", and the SAP systems screen reads the
 * second. PR-5 created SapServiceHealth and nothing wrote it; this does.
 */
export async function sweepLaneChecks(now: Date = new Date()): Promise<LaneSweepResult> {
  // Fleet-wide by design, like the connection sweep it runs beside.
  permitCrossTenantReads("lane-check-sweep: fleet-wide scheduled lane probe");

  const solutions = await prisma.solution.findMany({
    // ACTIVE and RESTRICTED: both carry traffic (lanes.ts, isLaneCheckedApp).
    where: { status: { in: [...LANE_CHECKED_APP_STATUSES] } },
    select: { id: true, organizationId: true, status: true, interfaces: { select: FEED_SELECT } },
  });
  const solutionIds = solutions.map((s) => s.id);
  const [grants, clients] = await Promise.all([
    prisma.apiAccessGrant.findMany({
      where: { solutionId: { in: solutionIds } },
      select: { ...GRANT_SELECT, organizationId: true, solutionId: true, externalId: true, environment: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.solutionClient.findMany({
      where: { solutionId: { in: solutionIds } },
      select: { ...CREDENTIAL_SELECT, organizationId: true },
    }),
  ]);

  const result = {
    checked: 0,
    skippedNoConnection: 0,
    skippedNoEntitySet: 0,
    skippedNoService: 0,
    skippedNoAccess: 0,
    unreadable: 0,
    discardedConnectionChanged: 0,
    byReadStatus: {} as Record<string, number>,
  };

  // One lookup per distinct service per run: a feed is checked in up to four
  // environments, and the service it names is the same in all of them. Keyed
  // by the feed's own path too, so two custom feeds never share an answer.
  const servicePaths = new Map<string, Promise<string | null>>();
  const servicePathFor = (t: LaneTarget): Promise<string | null> => {
    const key = laneServiceKey(t);
    let path = servicePaths.get(key);
    if (path === undefined) {
      path = resolveLaneServicePath(t.product, t.externalId, t.servicePath, t.odataVersion);
      servicePaths.set(key, path);
    }
    return path;
  };

  // Grouped by (org, product) so secrets open through the same resolver the
  // broker uses, once per group rather than per lane.
  const groups = new Map<string, { solution: (typeof solutions)[number]; feed: AuthorisableInterface }[]>();
  for (const solution of solutions) {
    for (const feed of solution.interfaces) {
      const key = `${solution.organizationId}::${feed.sapProduct}`;
      groups.set(key, [...(groups.get(key) ?? []), { solution, feed }]);
    }
  }

  for (const [groupKey, members] of groups) {
    const [organizationId, product] = groupKey.split("::") as [string, string];
    const estate = await loadBindingEstate(organizationId, product);
    const orgGrants = grants.filter((g) => g.organizationId === organizationId);
    const orgClients = clients.filter((c) => c.organizationId === organizationId);

    const work: { target: LaneTarget; connection: ResolvedSapConnection }[] = [];
    for (const { solution, feed } of members) {
      for (const environment of LANE_ENVIRONMENTS) {
        const plan = planLaneCheck({
          solutionStatus: solution.status,
          feed,
          environment,
          grants: orgGrants.filter((g) => g.solutionId === solution.id),
          credential: credentialFor(orgClients, solution.id, environment),
          estate,
          now,
        });
        if (!plan.ok) {
          countSkip(result, plan.skipped);
          continue;
        }
        work.push({ target: targetOf(organizationId, feed, environment), connection: plan.connection });
      }
    }

    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < work.length) {
        const item = work[cursor++];
        if (!item) continue;
        const servicePath = await servicePathFor(item.target);
        if (servicePath === null) {
          result.skippedNoService++;
          continue;
        }
        await checkOneLane(item.target, servicePath, item.connection, now, result);
      }
    }
    await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, work.length) }, worker));
  }

  return result;
}

function countSkip(
  result: { skippedNoConnection: number; skippedNoEntitySet: number; skippedNoAccess: number; unreadable: number },
  skipped: LaneCheckSkip,
): void {
  switch (skipped) {
    case "appNotLive":
      // Not fetched at all: the query takes live apps only.
      return;
    case "noEntitySet":
      result.skippedNoEntitySet++;
      return;
    case "accessRefused":
      result.skippedNoAccess++;
      return;
    case "unreadable":
      result.unreadable++;
      return;
    case "noConnection":
      result.skippedNoConnection++;
      return;
  }
}

/**
 * Re-check ONE lane, now, because a person asked.
 *
 * THE SAME WORK THE SWEEP DOES, not a second implementation of it. It plans
 * the lane with the same `planLaneCheck`, binds the same connection and calls
 * the same `checkOneLane`, so a lane re-checked by hand and a lane re-checked
 * at 04:30 write the same two rows and produce the same status. A "quick"
 * variant that probed without reading would re-introduce the
 * reachable-means-readable overclaim this whole module exists to remove.
 *
 * THE REFUSALS ARE THE SWEEP'S OWN SKIPS, named. A caller gets back which of
 * them applied rather than a bare failure, because the screen already has words
 * for each: a feed with no dataset has nothing to read, and no amount of
 * re-checking will change that. A retired or draft app is one of them (A70): it
 * used to be read on demand although the sweep never reads it.
 */
export type LaneRecheckOutcome =
  | { readonly ok: true; readonly readStatus: string; readonly checkedAt: Date }
  /**
   * `connectionChanged`: SAP was read, and the connection was re-saved while
   * it was, so the answer described the previous settings and was not
   * recorded (`recordLaneCheck`).
   */
  | { readonly ok: false; readonly skipped: LaneCheckSkip | "noService" | "connectionChanged" };

export async function recheckOneLane(
  organizationId: string,
  solutionId: string,
  interfaceId: string,
  environment: LaneEnvironment,
  now: Date = new Date(),
): Promise<LaneRecheckOutcome> {
  // Scoped to one lane, so no cross-tenant permit is taken out: unlike the
  // fleet sweep, this read belongs to the caller's own organization.
  const feed = await prisma.interface.findFirst({
    where: { id: interfaceId, solutionId, organizationId },
    select: { ...FEED_SELECT, solution: { select: { status: true } } },
  });
  if (feed === null) return { ok: false, skipped: "noEntitySet" };

  const [grants, clients] = await Promise.all([
    prisma.apiAccessGrant.findMany({
      where: { organizationId, solutionId },
      select: { ...GRANT_SELECT, externalId: true, environment: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.solutionClient.findMany({ where: { organizationId, solutionId }, select: CREDENTIAL_SELECT }),
  ]);

  const planWith = (estate: BindingEstate<ResolvedSapConnection>) =>
    planLaneCheck({
      solutionStatus: feed.solution.status,
      feed,
      environment,
      grants,
      credential: credentialFor(clients, solutionId, environment),
      estate,
      now,
    });
  // Planned first on no connections, so a lane refused before the binding —
  // a retired app's above all (A70) — reaches nobody's SAP system and has no
  // secret opened for it. Only a lane that got as far as the binding loads it.
  const before = planWith({ kind: "connections", connections: [] });
  if (!before.ok && before.skipped !== "noConnection") return { ok: false, skipped: before.skipped };
  const plan = planWith(await loadBindingEstate(organizationId, feed.sapProduct));
  if (!plan.ok) return { ok: false, skipped: plan.skipped };

  const target = targetOf(organizationId, feed, environment);
  const servicePath = await resolveLaneServicePath(
    target.product,
    target.externalId,
    target.servicePath,
    target.odataVersion,
  );
  if (servicePath === null) return { ok: false, skipped: "noService" };

  const tally = { checked: 0, discardedConnectionChanged: 0, byReadStatus: {} as Record<string, number> };
  await checkOneLane(target, servicePath, plan.connection, now, tally);
  if (tally.discardedConnectionChanged > 0) return { ok: false, skipped: "connectionChanged" };

  // `checkOneLane` records exactly one read status; naming it back to the
  // caller is what lets the screen say what changed without a second query.
  const readStatus = Object.keys(tally.byReadStatus)[0] ?? "ERROR";
  return { ok: true, readStatus, checkedAt: now };
}

async function checkOneLane(
  target: LaneTarget,
  /** Resolved by `resolveLaneServicePath` — never the raw catalogue id. */
  servicePath: string,
  connection: ResolvedSapConnection,
  now: Date,
  result: { checked: number; discardedConnectionChanged: number; byReadStatus: Record<string, number> },
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
    servicePath,
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
    // What this evidence was gathered against (A18): the board uses the row
    // only while all three still describe the lane.
    connectionId: connection.id,
    entitySet: target.entitySet,
    interfaceVersion: target.interfaceVersion,
    probeStatus,
    probeAt: probeStatus === null ? null : now,
    readStatus,
    readAt: now,
    readRowCount: read.records.length,
  };

  const recorded = await recordLaneCheck(connection, async (tx) => {
    await tx.laneCheck.upsert({
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

    // The per-service matrix the SAP systems screen reads. Keyed by service,
    // not by lane: several apps can read the same service through one system.
    await tx.sapServiceHealth.upsert({
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
  });
  if (!recorded) result.discardedConnectionChanged++;
}

/**
 * Write a check's evidence ONLY while its connection still holds the settings
 * the check read through (P0.2, A18).
 *
 * THE RACE THIS CLOSES. The sweep opens a product's connections once, then
 * reads SAP lane by lane for seconds to minutes. A re-save in the meantime
 * (`upsertSapConnection`) keeps the row's id, points it somewhere else and
 * drops the checks made through it — and the reads still running then wrote
 * the OLD system's answer under that same id, after the drop. The board took
 * it as proof for the new system: Live for up to a day while the broker,
 * bound to the new host, might refuse every call. A Re-check pressed just
 * before a save did the same.
 *
 * HOW. In one transaction: lock the connection row FOR SHARE and compare its
 * `revision` with the one this check loaded, then write. A re-save's UPDATE
 * waits for the lock, so the two serialise: either this commits first and the
 * re-save's deletes (in its own transaction, after its UPDATE) remove what was
 * written, or the re-save commits first and the revision no longer matches,
 * so nothing is written. A deleted connection matches no row and writes
 * nothing too. FOR SHARE, not FOR UPDATE: two lanes recorded through one
 * connection never wait on each other.
 *
 * Returns whether the evidence was recorded. Exported for its test against a
 * real database (tests/integration/lane-check-resave.test.ts).
 */
export async function recordLaneCheck(
  connection: Pick<ResolvedSapConnection, "id" | "organizationId" | "revision">,
  write: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<boolean> {
  // A connection not read from the table carries no revision: nothing proves
  // what it read through, so nothing is recorded.
  const loaded = connection.revision;
  if (loaded === undefined) return false;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ revision: number }[]>`
      SELECT "revision" FROM "SapConnection"
      WHERE "id" = ${connection.id} AND "organizationId" = ${connection.organizationId}
      FOR SHARE`;
    if (rows[0]?.revision !== loaded) return false;
    await write(tx);
    return true;
  });
}
