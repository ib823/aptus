import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import {
  deriveLaneStatus,
  notStartedVerdict,
  parseLaneEnvironment,
  type LaneEnvironment,
  type LaneVerdict,
  type ProbeFacts,
  type ReadFacts,
} from "./lanes";
import { LANE_ENVIRONMENTS } from "./lanes";

/**
 * Reading lanes out of the models that already hold the facts.
 *
 * EVERY QUERY IS SCOPED TO ONE ORGANIZATION, and the organization comes from the
 * session — never from a URL segment, a query string or a header. A console that
 * accepts a tenant id from the caller is a console with a tenant-isolation bug
 * waiting for someone to notice the parameter.
 *
 * NOTHING HERE INVENTS A LANE STATUS. The facts are gathered and handed to
 * `deriveLaneStatus`, which is pure and tested; this module's only judgement is
 * which rows count as which fact. Where a fact cannot be established the fields
 * say so (null), and the derivation turns that into `unknown` rather than a
 * guess.
 */


/* --- narrowing the ledger's free-text columns, honestly ------------------ */

const PROBE_STATUSES = ["OK", "UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "ERROR", "NO_PROBE_PATH"] as const;
const READ_OUTCOMES = ["OK", "EMPTY", "FORBIDDEN", "TIMEOUT", "ERROR"] as const;

/**
 * The ledger stores these as `String?`, and the derivation takes a closed union.
 *
 * An unrecognised value becomes null — "we do not know" — rather than being
 * cast into the union. A cast would let a status nobody has defined arrive at
 * `deriveLaneStatus` and fall through to whichever branch happens to catch it,
 * which is how a lane ends up claiming something no check established.
 */
function narrowProbeStatus(value: string | null): ProbeFacts["status"] {
  return (PROBE_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as ProbeFacts["status"])
    : null;
}

function narrowReadOutcome(value: string | null): ReadFacts["outcome"] {
  return (READ_OUTCOMES as readonly string[]).includes(value ?? "")
    ? (value as ReadFacts["outcome"])
    : null;
}

export interface LaneRow {
  readonly appId: string;
  readonly appSlug: string;
  readonly appName: string;
  readonly appStatus: "draft" | "active" | "restricted" | "retired";
  readonly feedId: string;
  readonly feedName: string;
  readonly environment: LaneEnvironment;
  /** The SAP system serving this lane, or null when none is bound. */
  readonly system: string | null;
  readonly verdict: LaneVerdict;
  readonly rows: number | null;
}

const APP_STATUS_BY_SOLUTION: Readonly<Record<string, LaneRow["appStatus"]>> = {
  DRAFT: "draft",
  ACTIVE: "active",
  RESTRICTED: "restricted",
  RETIRED: "retired",
};

/**
 * Free-text `environment` columns are folded through `parseLaneEnvironment`
 * rather than compared raw — see the note there. A row whose environment nobody
 * can name is counted under no lane at all, which is the honest outcome: we do
 * not know which lane it belongs to, so it cannot support a claim about one.
 */
function indexByEnvironment<T extends { environment: string | null }>(
  rows: readonly T[],
): Map<LaneEnvironment, T[]> {
  const byEnv = new Map<LaneEnvironment, T[]>();
  for (const row of rows) {
    const env = parseLaneEnvironment(row.environment);
    if (env === null) continue;
    byEnv.set(env, [...(byEnv.get(env) ?? []), row]);
  }
  return byEnv;
}

export interface LaneQueryOptions {
  /** Restrict to one app, by slug. Omit for every app in the organization. */
  readonly appSlug?: string;
  readonly now?: Date;
}

/**
 * Every lane in an organization: each app × each of its feeds × four
 * environments.
 *
 * The cartesian product is the point. A lane that has never been started still
 * exists as a cell — that is what makes "Not started" a status and what lets the
 * board show a feed's progression across environments at a glance. Listing only
 * the lanes that have rows behind them would hide exactly the ones a builder
 * needs to act on.
 */
export async function listLanes(
  organizationId: string,
  options: LaneQueryOptions = {},
): Promise<LaneRow[]> {
  const now = options.now ?? new Date();

  const solutions = await prisma.solution.findMany({
    where: {
      organizationId,
      ...(options.appSlug === undefined ? {} : { slug: options.appSlug }),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      interfaces: {
        select: { id: true, name: true, externalId: true, operation: true, status: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  if (solutions.length === 0) return [];

  const solutionIds = solutions.map((s) => s.id);

  const [grants, clients, connections, checks] = await Promise.all([
    prisma.apiAccessGrant.findMany({
      where: { organizationId, solutionId: { in: solutionIds } },
      select: {
        solutionId: true,
        externalId: true,
        operation: true,
        environment: true,
        decision: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.solutionClient.findMany({
      where: { organizationId, solutionId: { in: solutionIds } },
      select: {
        solutionId: true,
        environment: true,
        isActive: true,
        revokedAt: true,
        expiresAt: true,
      },
    }),
    prisma.sapConnection.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, label: true, environment: true },
    }),
    /*
     * The per-lane check ledger. One row per (solution, interface, environment),
     * written by the scheduled lane sweep — see src/lib/ops/lane-check-sweep.ts.
     * A lane with no row here has never been checked, and derives to `unknown`
     * with "no check has ever run" rather than to a guess.
     */
    prisma.laneCheck.findMany({
      where: { organizationId, solutionId: { in: solutionIds } },
      select: {
        solutionId: true,
        interfaceId: true,
        environment: true,
        probeStatus: true,
        probeAt: true,
        readStatus: true,
        readAt: true,
        readRowCount: true,
      },
    }),
  ]);

  const connectionsByEnv = indexByEnvironment(connections);

  /** Keyed exactly as the ledger's unique constraint is, so a lane has one row. */
  const checkByLane = new Map(
    checks.map((c) => [`${c.solutionId}::${c.interfaceId}::${c.environment}`, c]),
  );

  const lanes: LaneRow[] = [];

  for (const solution of solutions) {
    const appStatus = APP_STATUS_BY_SOLUTION[solution.status] ?? "draft";
    const solutionGrants = grants.filter((g) => g.solutionId === solution.id);
    const solutionClients = clients.filter((c) => c.solutionId === solution.id);

    for (const feed of solution.interfaces) {
      for (const environment of LANE_ENVIRONMENTS) {
        /*
         * The MOST RECENT grant for this exact (feed, operation, environment)
         * decides. Grants accumulate — a renewal is a new row — and an older
         * REVOKED alongside a newer APPROVED must not make the lane look dead.
         * The query orders by createdAt desc, so the first match is the current
         * one.
         */
        const grant = solutionGrants.find(
          (g) =>
            g.externalId === feed.externalId &&
            g.operation === feed.operation &&
            parseLaneEnvironment(g.environment) === environment,
        );

        const client = solutionClients.find(
          (c) => parseLaneEnvironment(c.environment) === environment,
        );

        const envConnections = connectionsByEnv.get(environment) ?? [];

        // This lane's own evidence row, or undefined when it has never been
        // checked. Keyed by feed id rather than externalId: two feeds can read
        // the same SAP service with different field lists, and they are
        // different lanes with different proof.
        const check = checkByLane.get(`${solution.id}::${feed.id}::${environment}`);

        // Nothing requested at all: a cell, not a failure.
        if (grant === undefined && client === undefined) {
          lanes.push({
            appId: solution.id,
            appSlug: solution.slug,
            appName: solution.name,
            appStatus,
            feedId: feed.id,
            feedName: feed.name,
            environment,
            system: envConnections[0]?.label ?? null,
            verdict: notStartedVerdict(),
            rows: null,
          });
          continue;
        }

        const verdict = deriveLaneStatus({
          appRetired: solution.status === "RETIRED",
          key: {
            exists: client !== undefined,
            isActive: client?.isActive ?? false,
            revokedAt: client?.revokedAt ?? null,
            expiresAt: client?.expiresAt ?? null,
          },
          access: {
            decision: grant?.decision ?? null,
            expiresAt: grant?.expiresAt ?? null,
            revokedAt: grant?.revokedAt ?? null,
          },
          binding: {
            matchingConnections: envConnections.length,
            /*
             * NOT KNOWABLE FROM A LIST QUERY. Whether a stored secret decrypts
             * is only discovered by attempting it, which is a per-connection
             * operation and not something a board should trigger for every
             * lane. Reported as false here and established on the SAP system
             * screen, where someone is actually looking at that connection.
             */
            secretUnreadable: false,
          },
          /*
           * THE EVIDENCE, PER LANE. Both outcomes come from this lane's own
           * ledger row rather than from the connection's health, because a
           * connection-level green cannot support the claim that THIS app can
           * read THIS dataset here — the reachable-means-readable overclaim
           * the lane model exists to prevent.
           *
           * No row means no check has ever run, and the nulls below derive to
           * `unknown` saying exactly that. That is still the honest answer; it
           * is now the answer for lanes nobody has checked rather than for
           * every lane.
           */
          probe: {
            status: narrowProbeStatus(check?.probeStatus ?? null),
            at: check?.probeAt ?? null,
          },
          read: {
            outcome: narrowReadOutcome(check?.readStatus ?? null),
            at: check?.readAt ?? null,
            rows: check?.readRowCount ?? null,
          },
          now,
        });

        lanes.push({
          appId: solution.id,
          appSlug: solution.slug,
          appName: solution.name,
          appStatus,
          feedId: feed.id,
          feedName: feed.name,
          environment,
          system: envConnections[0]?.label ?? null,
          verdict,
          rows: null,
        });
      }
    }
  }

  return lanes;
}

export interface AppSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: LaneRow["appStatus"];
  readonly feedCount: number;
}

export async function listApps(organizationId: string): Promise<AppSummary[]> {
  const solutions = await prisma.solution.findMany({
    where: { organizationId },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      _count: { select: { interfaces: true } },
    },
    orderBy: { name: "asc" },
  });
  return solutions.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    status: APP_STATUS_BY_SOLUTION[s.status] ?? "draft",
    feedCount: s._count.interfaces,
  }));
}

export interface RequestRow {
  readonly id: string;
  readonly appId: string;
  readonly appName: string;
  readonly appSlug: string;
  readonly feedLabel: string;
  readonly environment: LaneEnvironment | null;
  /** The raw environment string, kept when it does not parse. */
  readonly environmentRaw: string;
  readonly decision: string;
  readonly justification: string;
  readonly requestedById: string | null;
  readonly requestedByName: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
}

/**
 * Access requests awaiting a decision, newest first.
 *
 * `requestedById` is returned so the review screen can refuse self-approval
 * without a second query. That refusal is the point of the screen.
 */
export async function listOpenRequests(organizationId: string): Promise<RequestRow[]> {
  const grants = await prisma.apiAccessGrant.findMany({
    where: { organizationId, decision: "REQUESTED" },
    select: {
      id: true,
      solutionId: true,
      externalId: true,
      operation: true,
      environment: true,
      decision: true,
      justification: true,
      requestedById: true,
      createdAt: true,
      expiresAt: true,
      solution: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const requesterIds = [
    ...new Set(grants.map((g) => g.requestedById).filter((id): id is string => id !== null)),
  ];
  const requesters =
    requesterIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, name: true },
        });
  const nameById = new Map(requesters.map((u) => [u.id, u.name]));

  return grants.map((g) => ({
    id: g.id,
    appId: g.solution.id,
    appName: g.solution.name,
    appSlug: g.solution.slug,
    feedLabel: `${g.externalId} · ${g.operation}`,
    environment: parseLaneEnvironment(g.environment),
    environmentRaw: g.environment,
    decision: g.decision,
    justification: g.justification,
    requestedById: g.requestedById,
    requestedByName: g.requestedById === null ? null : (nameById.get(g.requestedById) ?? null),
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
  }));
}

export async function getRequest(
  organizationId: string,
  id: string,
): Promise<RequestRow | null> {
  const g = await prisma.apiAccessGrant.findFirst({
    // organizationId in the WHERE, not checked after the fetch: a row from
    // another tenant must not be read at all, not read and then discarded.
    where: { id, organizationId },
    select: {
      id: true,
      externalId: true,
      operation: true,
      environment: true,
      decision: true,
      justification: true,
      requestedById: true,
      createdAt: true,
      expiresAt: true,
      solution: { select: { id: true, name: true, slug: true } },
    },
  });
  if (g === null) return null;

  const requester =
    g.requestedById === null
      ? null
      : await prisma.user.findUnique({
          where: { id: g.requestedById },
          select: { name: true },
        });

  return {
    id: g.id,
    appId: g.solution.id,
    appName: g.solution.name,
    appSlug: g.solution.slug,
    feedLabel: `${g.externalId} · ${g.operation}`,
    environment: parseLaneEnvironment(g.environment),
    environmentRaw: g.environment,
    decision: g.decision,
    justification: g.justification,
    requestedById: g.requestedById,
    requestedByName: requester?.name ?? null,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
  };
}

export interface SapSystemRow {
  readonly id: string;
  readonly name: string;
  readonly environment: LaneEnvironment | null;
  readonly environmentRaw: string | null;
}

export async function listSapSystems(organizationId: string): Promise<SapSystemRow[]> {
  const rows = await prisma.sapConnection.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, label: true, environment: true },
    orderBy: { label: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.label,
    environment: parseLaneEnvironment(r.environment),
    environmentRaw: r.environment,
  }));
}

/* ------------------------------------------------------------------------- *
 * PR-6 — the remaining seven screens.
 *
 * Everything below reads the same models the lane board reads. Where a screen
 * in the design shows a fact this schema does not hold, the field is null and
 * the screen says so; none of it is inferred. The one place that bites is
 * recorded on `PassportRow.fieldsApproved`.
 * ------------------------------------------------------------------------- */


/* --- pure derivations, kept out of the queries so they can be tested --- */

/**
 * Whether a stored read status counts as proof that a feed is readable.
 *
 * Only a read that RETURNED is proof. FORBIDDEN, TIMEOUT, NOT_FOUND and ERROR
 * all say something happened; none says the feed can be read, and a catalogue
 * badge is read as "this works here". EMPTY counts: SAP answered successfully
 * and had nothing to return, which proves the path works.
 */
export function isProvenRead(readStatus: string | null): boolean {
  return readStatus === "OK" || readStatus === "EMPTY";
}

/**
 * Environments claimed by more than one ACTIVE system (O05).
 *
 * Deactivated systems do not contest: dropping a claim by deactivating is the
 * documented way out of the standoff, so counting them would leave the screen
 * reporting a conflict that the operator has already resolved.
 */
export function contestedEnvironments(
  connections: readonly { readonly environment: string | null; readonly isActive: boolean }[],
): ReadonlySet<LaneEnvironment> {
  const claims = new Map<LaneEnvironment, number>();
  for (const c of connections) {
    if (!c.isActive) continue;
    const env = parseLaneEnvironment(c.environment);
    if (env === null) continue;
    claims.set(env, (claims.get(env) ?? 0) + 1);
  }
  const contested = new Set<LaneEnvironment>();
  for (const [env, count] of claims) if (count > 1) contested.add(env);
  return contested;
}

export const KEY_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * What the operator is invited to consider about a key, from traffic alone.
 *
 * O08 is explicit that this is a suggestion and not a sweep: "unused" is a fact
 * about what happened, "unwanted" is a judgement about intent, and only the
 * first is knowable here. Nothing expires on its own.
 */
export function keySuggestion(
  key: { readonly revokedAt: Date | null; readonly lastUsedAt: Date | null },
  now: Date,
): string {
  if (key.revokedAt !== null) return "Revoked";
  if (key.lastUsedAt === null) return "Never used · nothing depends on it";
  if (now.getTime() - key.lastUsedAt.getTime() > KEY_IDLE_MS) {
    return "Not used in 30 days · ask the owner before revoking";
  }
  return "In active use · keep";
}

/** One SAP data feed as the catalogue lists it, with what has been proven. */
export interface CatalogueEntry {
  readonly externalId: string;
  readonly entitySet: string | null;
  readonly operation: string;
  /** Feeds carry the app's name for it; the SAP identifiers sit underneath. */
  readonly names: readonly string[];
  /** Environments where a read against this service has actually returned. */
  readonly provenIn: readonly CatalogueProof[];
  /** True once any captured contract exists, which is what an SDK needs. */
  readonly contractCaptured: boolean;
}

export interface CatalogueProof {
  readonly environment: LaneEnvironment;
  readonly system: string;
  readonly rows: number | null;
  readonly at: Date | null;
}

/**
 * The catalogue, built from service health rather than from the feed list.
 *
 * A feed row proves only that somebody declared it. "Reads proven" is a claim
 * about a read that returned, so it comes from `SapServiceHealth.readStatus`
 * joined through the connection that produced it — and an environment with no
 * health row is absent from `provenIn` rather than present with a null, because
 * "we have never looked" and "we looked and got nothing" are different answers
 * and the badge ages differ.
 */
export async function listCatalogue(organizationId: string): Promise<CatalogueEntry[]> {
  const [feeds, health, connections] = await Promise.all([
    prisma.interface.findMany({
      where: { organizationId },
      select: {
        externalId: true,
        entitySet: true,
        operation: true,
        name: true,
        responseSchema: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.sapServiceHealth.findMany({
      where: { organizationId },
      select: {
        serviceName: true,
        entitySet: true,
        connectionId: true,
        readStatus: true,
        readAt: true,
        readRowCount: true,
      },
    }),
    prisma.sapConnection.findMany({
      where: { organizationId },
      select: { id: true, label: true, environment: true },
    }),
  ]);

  const connectionById = new Map(connections.map((c) => [c.id, c]));
  const byService = new Map<string, CatalogueEntry>();

  for (const feed of feeds) {
    const key = `${feed.externalId}::${feed.entitySet ?? ""}`;
    const existing = byService.get(key);
    if (existing) {
      byService.set(key, {
        ...existing,
        names: existing.names.includes(feed.name)
          ? existing.names
          : [...existing.names, feed.name],
        contractCaptured: existing.contractCaptured || feed.responseSchema !== null,
      });
      continue;
    }
    byService.set(key, {
      externalId: feed.externalId,
      entitySet: feed.entitySet,
      operation: feed.operation,
      names: [feed.name],
      provenIn: [],
      contractCaptured: feed.responseSchema !== null,
    });
  }

  for (const row of health) {
    if (!isProvenRead(row.readStatus)) continue;
    const connection = connectionById.get(row.connectionId);
    if (!connection) continue;
    const environment = parseLaneEnvironment(connection.environment);
    if (environment === null) continue;

    const key = `${row.serviceName}::${row.entitySet ?? ""}`;
    const entry = byService.get(key);
    if (!entry) continue;
    byService.set(key, {
      ...entry,
      provenIn: [
        ...entry.provenIn,
        {
          environment,
          system: connection.label,
          rows: row.readRowCount,
          at: row.readAt,
        },
      ],
    });
  }

  return [...byService.values()].sort((a, b) =>
    (a.names[0] ?? a.externalId).localeCompare(b.names[0] ?? b.externalId),
  );
}

/** One issued key, as the keys screen lists it. Never the key itself. */
export interface KeyRow {
  readonly id: string;
  readonly appName: string;
  readonly appSlug: string;
  readonly environment: LaneEnvironment | null;
  readonly environmentRaw: string;
  readonly issuedAt: Date;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
  /** Last four of the stored label, for recognition. Never the token. */
  readonly tail: string;
}

/**
 * Keys, for the operations keys screen.
 *
 * `tokenHash` is never selected. The screen recognises a key by its app, its
 * environment and a four-character tail; a console that could show the value
 * would be a second place the key exists, which is the whole thing the
 * one-time claim link is built to avoid.
 */
export async function listKeys(organizationId: string): Promise<KeyRow[]> {
  const [clients, solutions] = await Promise.all([
    prisma.solutionClient.findMany({
      where: { organizationId },
      select: {
        id: true,
        solutionId: true,
        label: true,
        environment: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.solution.findMany({
      where: { organizationId },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const solutionById = new Map(solutions.map((s) => [s.id, s]));

  return clients.map((c) => {
    const solution = solutionById.get(c.solutionId);
    return {
      id: c.id,
      appName: solution?.name ?? c.solutionId,
      appSlug: solution?.slug ?? "",
      environment: parseLaneEnvironment(c.environment),
      environmentRaw: c.environment,
      issuedAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      revokedAt: c.revokedAt,
      expiresAt: c.expiresAt,
      tail: c.label.slice(-4),
    };
  });
}

/**
 * The decisions that let a read reach the CLIENT's SAP.
 *
 * SANDBOX_ONLY is excluded on purpose, and its absence is not an oversight.
 * Sandbox runs against one ABeam-owned API Hub key — S04: "Nothing here touches
 * X5M" — so a sandbox approval moves no client data and has no place on a
 * screen that answers "what leaves our system". D2 keeps SANDBOX_ONLY readable
 * for historical rows; it does not make it a client-data approval.
 */
const PASSPORT_DECISIONS = ["APPROVED", "READ_ONLY"] as const;

/** One connected SAP system, with what the console can say about it. */
export interface SapSystemDetailRow {
  readonly id: string;
  readonly name: string;
  readonly environment: LaneEnvironment | null;
  readonly environmentRaw: string | null;
  readonly host: string;
  readonly client: string | null;
  readonly authType: string;
  readonly isActive: boolean;
  readonly lastValidatedAt: Date | null;
  readonly lastValidationStatus: string | null;
  /** How many lanes read this system — the blast radius of switching it off. */
  readonly boundLanes: number;
  /**
   * True when another ACTIVE system claims the same environment. Every lane in
   * that environment refuses to bind rather than pick one (O05).
   */
  readonly environmentContested: boolean;
}

/**
 * The SAP systems list.
 *
 * CONTESTED ENVIRONMENTS ARE COMPUTED HERE, not assumed away by the schema.
 * PR-0's partial unique index stops a *new* second claim on an environment, but
 * rows that predate it still exist — which is exactly the migrated data O05
 * describes. Treating the index as proof of uniqueness would render a screen
 * that cannot show the one problem it exists to show.
 */
export async function listSapSystemDetails(
  organizationId: string,
): Promise<SapSystemDetailRow[]> {
  const [connections, grants] = await Promise.all([
    prisma.sapConnection.findMany({
      where: { organizationId },
      select: {
        id: true,
        label: true,
        environment: true,
        baseUrl: true,
        client: true,
        authType: true,
        isActive: true,
        lastValidatedAt: true,
        lastValidationStatus: true,
      },
      orderBy: { label: "asc" },
    }),
    prisma.apiAccessGrant.findMany({
      where: {
        organizationId,
        decision: { in: [...PASSPORT_DECISIONS] },
        revokedAt: null,
      },
      select: { environment: true },
    }),
  ]);

  const contested = contestedEnvironments(connections);

  const grantsByEnv = new Map<LaneEnvironment, number>();
  for (const g of grants) {
    const env = parseLaneEnvironment(g.environment);
    if (env === null) continue;
    grantsByEnv.set(env, (grantsByEnv.get(env) ?? 0) + 1);
  }

  return connections.map((c) => {
    const environment = parseLaneEnvironment(c.environment);
    return {
      id: c.id,
      name: c.label,
      environment,
      environmentRaw: c.environment,
      host: c.baseUrl,
      client: c.client,
      authType: c.authType,
      isActive: c.isActive,
      lastValidatedAt: c.lastValidatedAt,
      lastValidationStatus: c.lastValidationStatus,
      boundLanes: environment === null ? 0 : (grantsByEnv.get(environment) ?? 0),
      environmentContested: environment !== null && c.isActive && contested.has(environment),
    };
  });
}

/** One service on one system: the two facts SAP grants separately. */
export interface ServiceHealthRow {
  readonly serviceName: string;
  readonly entitySet: string | null;
  readonly metadataStatus: string | null;
  readonly metadataAt: Date | null;
  readonly readStatus: string | null;
  readonly readAt: Date | null;
  readonly readRowCount: number | null;
}

export interface SapSystemDetail {
  readonly system: SapSystemDetailRow;
  readonly services: readonly ServiceHealthRow[];
}

/**
 * One system and its per-service matrix.
 *
 * Metadata reachability and data readability stay two columns, never merged
 * into one dot. SAP grants them separately, so a system can describe a service
 * it will not let the communication user read — and collapsing that sends half
 * of all triage to the wrong team.
 */
export async function getSapSystemDetail(
  organizationId: string,
  id: string,
): Promise<SapSystemDetail | null> {
  const all = await listSapSystemDetails(organizationId);
  const system = all.find((s) => s.id === id);
  if (!system) return null;

  const services = await prisma.sapServiceHealth.findMany({
    where: { organizationId, connectionId: id },
    select: {
      serviceName: true,
      entitySet: true,
      metadataStatus: true,
      metadataAt: true,
      readStatus: true,
      readAt: true,
      readRowCount: true,
    },
    orderBy: { serviceName: "asc" },
  });

  return { system, services };
}

/** One approved grant, as the passport shows it to a client CIO. */
export interface PassportRow {
  readonly appName: string;
  readonly feedName: string;
  readonly externalId: string;
  readonly environment: LaneEnvironment | null;
  readonly environmentRaw: string;
  readonly operation: string;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly accessEnds: Date | null;
  /**
   * ALWAYS NULL, and deliberately so.
   *
   * X06 shows "12 of 71" for every row, and calls that ratio the fact that
   * matters — an app approved for a service is not approved for everything in
   * it. This schema has nowhere to hold it: `Interface.responseSchema` is a
   * captured contract, not a selection, and no model records which fields a
   * grant covers. Rendering the count of a captured schema here would answer a
   * question about approval with a number about SAP, on the one screen whose
   * entire purpose is telling a client exactly what leaves their system.
   *
   * So the screen prints what it has and names the gap. Recorded in the PR as a
   * capability the designs assume and the backend does not have.
   */
  readonly fieldsApproved: null;
}

/**
 * The passport: every approved, unrevoked read, for a client CIO.
 *
 * Read-only by construction — there is no revoke path from this query and none
 * on the screen. X06 is explicit that a CIO who wants something stopped says
 * so and an ABeam reviewer does it with a reason on the record.
 */
export async function listPassport(organizationId: string): Promise<PassportRow[]> {
  const [grants, feeds, users] = await Promise.all([
    prisma.apiAccessGrant.findMany({
      where: {
        organizationId,
        decision: { in: [...PASSPORT_DECISIONS] },
        revokedAt: null,
      },
      select: {
        externalId: true,
        operation: true,
        environment: true,
        decidedById: true,
        decidedAt: true,
        expiresAt: true,
        solution: { select: { name: true } },
      },
      orderBy: { decidedAt: "desc" },
    }),
    prisma.interface.findMany({
      where: { organizationId },
      select: { externalId: true, name: true },
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);

  const feedNameByExternalId = new Map(feeds.map((f) => [f.externalId, f.name]));
  const userById = new Map(users.map((u) => [u.id, u.name]));

  return grants.map((g) => ({
    appName: g.solution.name,
    feedName: feedNameByExternalId.get(g.externalId) ?? g.externalId,
    externalId: g.externalId,
    environment: parseLaneEnvironment(g.environment),
    environmentRaw: g.environment,
    operation: g.operation,
    approvedBy: g.decidedById === null ? null : (userById.get(g.decidedById) ?? null),
    approvedAt: g.decidedAt,
    accessEnds: g.expiresAt,
    fieldsApproved: null,
  }));
}

/** What retiring an app would stop, counted live. */
export interface AppSettings {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: LaneRow["appStatus"];
  readonly keys: readonly KeyRow[];
  readonly feeds: readonly string[];
}

/**
 * One app's settings, and the blast radius of retiring it.
 *
 * The impact list is read here rather than cached. A06's own note is that a
 * cached count could say three lanes when a fourth was bound this morning, and
 * the confirmation must never under-state what an app is still doing.
 */
export async function getAppSettings(
  organizationId: string,
  slug: string,
): Promise<AppSettings | null> {
  const solution = await prisma.solution.findFirst({
    where: { organizationId, slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      interfaces: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!solution) return null;

  const keys = (await listKeys(organizationId)).filter((k) => k.appSlug === solution.slug);

  return {
    id: solution.id,
    name: solution.name,
    slug: solution.slug,
    status: APP_STATUS_BY_SOLUTION[solution.status] ?? "draft",
    keys,
    feeds: solution.interfaces.map((i) => i.name),
  };
}

/** A catalogue entry opened for adding, with the fields SAP describes. */
export interface FeedDraft {
  readonly entry: CatalogueEntry;
  /**
   * Field names read from the captured contract, or empty when none exists.
   *
   * S03 reads the list from `$metadata` at pick time. Nothing here calls SAP —
   * these are the names of a contract already captured, and an empty list means
   * no read has ever returned for this feed, which the screen says rather than
   * showing an empty picker that looks like a service with no fields.
   */
  readonly availableFields: readonly string[];
}

/**
 * One catalogue entry, prepared for the add-feed screen.
 *
 * `responseSchema` is a captured contract — the shape of what a read returned.
 * It is NOT a record of which fields an app was approved for; no model holds
 * that. So this can offer the fields to choose from and cannot record a choice,
 * which is why the add-feed screen's submit is disabled with that reason rather
 * than writing a selection somewhere it would not be read back.
 */
export async function getFeedDraft(
  organizationId: string,
  externalId: string,
): Promise<FeedDraft | null> {
  const entries = await listCatalogue(organizationId);
  const entry = entries.find((e) => e.externalId === externalId);
  if (!entry) return null;

  const withSchema = await prisma.interface.findFirst({
    where: { organizationId, externalId, responseSchema: { not: Prisma.DbNull } },
    select: { responseSchema: true },
  });

  return { entry, availableFields: fieldNamesOf(withSchema?.responseSchema) };
}

/**
 * Field names out of a captured JSON schema, defensively.
 *
 * The column is `Json?` and nothing constrains its shape, so anything that is
 * not an object with string keys yields no fields rather than a crash or a
 * plausible-looking list of array indices.
 */
function fieldNamesOf(schema: unknown): readonly string[] {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return [];
  const record = schema as Record<string, unknown>;
  const properties = record["properties"];
  const source =
    properties !== null && typeof properties === "object" && !Array.isArray(properties)
      ? (properties as Record<string, unknown>)
      : record;
  return Object.keys(source).sort((a, b) => a.localeCompare(b));
}
