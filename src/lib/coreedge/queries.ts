import "server-only";

import { prisma } from "@/lib/db/prisma";

import {
  deriveLaneStatus,
  notStartedVerdict,
  parseLaneEnvironment,
  type LaneEnvironment,
  type LaneVerdict,
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

  const [grants, clients, connections] = await Promise.all([
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
  ]);

  const connectionsByEnv = indexByEnvironment(connections);

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
           * NO PROBE OR READ EVIDENCE IS JOINED HERE, deliberately, and this is
           * why most lanes will read Unknown until PR-5 lands. The probe table
           * is per-connection rather than per-lane, and there is no per-lane
           * read ledger at all — so a board-wide claim of Live would be
           * inferred from a connection-level green, which is exactly the
           * reachable-means-readable overclaim the lane model exists to
           * prevent. `unknown` is the honest answer and it says so in words.
           */
          probe: { status: null, at: null },
          read: { outcome: null, at: null, rows: null },
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
