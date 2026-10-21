/**
 * The tenant-scope guard, attached to the LIVE Prisma client.
 *
 * `tenantScopeGuard()` existed as an exported factory that nothing applied —
 * a declared control the runtime did not enforce, which is this phase's exact
 * failure signature. It lives here (not in lib/studio/tenant-scope) so that
 * `lib/db/prisma` can attach it without a circular import: tenant-scope pulls
 * in the permissions module, which itself uses the Prisma client.
 *
 * THREE MODES, env-controlled via TENANT_SCOPE_GUARD:
 *   throw — a query against a tenant-anchored model with no organizationId in
 *           its where fails loudly. Default outside production.
 *   log   — the violation is logged, counted durably (TenantGuardViolation,
 *           below) and the query runs. Default IN production, as the burn-in:
 *           flip to throw once seven days pass with no violation recorded. A
 *           legitimate path the burn-down missed should show up as a record,
 *           never as an outage.
 *   off   — the guard does nothing (escape hatch, not a steady state).
 *
 * DELIBERATE CROSS-TENANT READS ARE DECLARED, NOT INFERRED. A platform admin
 * with no organization reading every tenant's feed is a real capability; the
 * ops guard marks the request's async context via `permitCrossTenantReads`,
 * and so do the scheduled sweeps that serve every tenant in one run. The
 * declaration is context-scoped (AsyncLocalStorage), so it cannot leak from
 * one request into another.
 */

// Bare specifier, not `node:async_hooks`: client components transitively reach
// lib/db/prisma (via long-standing import chains that work because
// @prisma/client ships a browser stub), and webpack cannot bundle the node:
// scheme at all. The bare form resolves to an empty module on the client (see
// next.config.ts fallback), so the guard is inert exactly where no query runs.
import { AsyncLocalStorage } from "async_hooks";

import type { Prisma } from "@prisma/client";

/**
 * Models whose queries must carry a tenant. Mirrored by tenant-scope.ts.
 *
 * `PlatformAuditEvent` is absent ON PURPOSE, not by omission: it records
 * Workbench writes to the deployment's own SAP tenant, which no organization
 * owns, made by platform admins who may have none. There is no tenant to scope
 * it to, so its reads are gated to `platform_admin` instead
 * (/api/ops/workbench-writes). tenant-guard.test.ts pins this.
 */
export const TENANT_ANCHORED_MODELS = [
  "Solution",
  "Interface",
  "ApiAccessGrant",
  "TestCase",
  "ConfigAudit",
  "SapConnection",
  "SolutionClient",
  "NorthboundAuditEvent",
  "MockFixture",
  // Carries organizationId in its unique key; was missing from this list, so
  // the guard could not see it. complete/release address rows by server-derived
  // id (safe), but the model is tenant-anchored and the roster should say so.
  "NorthboundIdempotencyKey",
  // P0.10: an organization's wrapped data keys. Opening a secret reads exactly
  // one organization's row; only the key scripts read across tenants, and they
  // declare it with permitCrossTenantReads.
  "OrgDataKey",
  // P0.11 (wave 1a final review): the keys a SolutionClient row has dropped.
  // Written only nested in that row's own scoped update; read only by hash
  // (UNSCOPED_BY_DESIGN below).
  "RetiredClientToken",
  // P0.8: which catalogue V4 addresses answered 200 on whose system. A
  // deployment tenant's rows are filed under "-deployment-", so every query
  // still names an organizationId.
  "CatalogueAddressVerification",
  // P2.12: first occurrences on each organization's way to a first call. The
  // Control Tower read across organizations runs in the ops guard's declared
  // cross-tenant context; nothing looks a row up by a credential.
  "DeveloperJourneyEvent",
] as const;

export type TenantAnchoredModel = (typeof TENANT_ANCHORED_MODELS)[number];

/** Operations whose `where` must carry a tenant. Creates are covered separately. */
const SCOPED_OPERATIONS = new Set([
  "findFirst",
  "findMany",
  "findUnique",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

// Undefined in a client bundle (empty-module fallback) — every consumer below
// guards on that, and no Prisma query exists client-side to need it.
const crossTenantContext =
  typeof AsyncLocalStorage === "function"
    ? new AsyncLocalStorage<{ reason: string }>()
    : null;

/**
 * Declare that the CURRENT async context performs deliberate cross-tenant
 * reads. Called by the ops guard's global-admin branch and by scheduled sweeps
 * — the two places where "no organizationId" is the design, not a bug. The
 * reason string is for the log line when someone asks why a context is exempt.
 */
export function permitCrossTenantReads(reason: string): void {
  crossTenantContext?.enterWith({ reason });
}

/** Exposed for the guard and for tests; null when nothing was declared. */
export function crossTenantPermission(): { reason: string } | null {
  return crossTenantContext?.getStore() ?? null;
}

export type TenantGuardMode = "throw" | "log" | "off";

export function tenantGuardMode(): TenantGuardMode {
  const raw = process.env.TENANT_SCOPE_GUARD;
  if (raw === "throw" || raw === "log" || raw === "off") return raw;
  // Loud where it costs nothing; observed-first where an unexercised
  // legitimate path would otherwise become an outage.
  return process.env.NODE_ENV === "production" ? "log" : "throw";
}

function whereHasOrganization(args: unknown): boolean {
  if (!args || typeof args !== "object") return false;
  const where = (args as { where?: unknown }).where;
  if (!where || typeof where !== "object") return false;
  if ("organizationId" in (where as Record<string, unknown>)) return true;
  // A nested relation filter (e.g. { bundle: { organizationId } }) also scopes.
  return JSON.stringify(where).includes("organizationId");
}

/**
 * The queries that cannot carry a tenant, and why. Each entry is a model, an
 * operation AND an exact where-shape; anything wider is a violation.
 *
 * `authenticateClientToken` looks a client up BY ITS TOKEN HASH. There is no
 * organization to scope it to, because the organization is the OUTPUT of this
 * lookup — it is how an unauthenticated bearer token becomes a tenant at all.
 * Safe because `SolutionClient.tokenHash` is `@unique`: it can only return the
 * single row whose hash was presented, and a caller who does not already hold
 * the token learns nothing.
 *
 * The rotation overlap (P0.11) adds the second lookup of the same kind: a
 * token that is no row's current key is looked up by `previousTokenHash`,
 * also `@unique`, for the same reason and with the same guarantee — it finds
 * only the row whose replaced key was presented. Any other field beside it,
 * or any other operation on it, is not exempt.
 *
 * A key the row has dropped altogether (RetiredClientToken, wave 1a final
 * review) is the third lookup of the same kind, by its `@id` hash, on a miss
 * of both: it finds only the record of the key presented, and that record
 * only ever refuses.
 *
 * Since P0.19 the governed call makes these three lookups as ONE raw
 * statement (lib/governed/call-loads.ts lookupCredential), which this guard
 * does not see. Its predicates are exactly these three equalities, pinned by
 * tests/unit/governed/call-loads-sql.test.ts; these entries still sanction
 * the Prisma form, for any other caller.
 */
const UNSCOPED_BY_DESIGN: readonly {
  readonly model: string;
  readonly operation: string;
  readonly whereKey: string;
}[] = [
  { model: "SolutionClient", operation: "findUnique", whereKey: "tokenHash" },
  { model: "SolutionClient", operation: "findUnique", whereKey: "previousTokenHash" },
  { model: "RetiredClientToken", operation: "findUnique", whereKey: "tokenHash" },
];

/** Exported for its unit test; the guard below is its only caller. */
export function isUnscopedByDesign(model: string, operation: string, args: unknown): boolean {
  if (!args || typeof args !== "object") return false;
  const where = (args as { where?: unknown }).where;
  if (!where || typeof where !== "object") return false;
  const keys = Object.keys(where as Record<string, unknown>);
  if (keys.length !== 1) return false;
  // An equality on the hash, never a filter: `{ previousTokenHash: { not: null } }`
  // is not "the row whose key was presented".
  if (typeof (where as Record<string, unknown>)[keys[0]!] !== "string") return false;
  return UNSCOPED_BY_DESIGN.some(
    (entry) => entry.model === model && entry.operation === operation && entry.whereKey === keys[0],
  );
}

/*
 * THE BURN-IN IS RECORDED, NOT ONLY LOGGED.
 *
 * Log mode exists so that the switch to throw can be made on evidence: zero
 * violations over seven days. Runtime logs are kept for one to three days, so
 * a console line cannot be that evidence. Each violation is therefore also
 * counted durably (TenantGuardViolation, written by the recorder lib/db/prisma
 * registers, through the UNEXTENDED client so the write cannot itself be
 * guarded). The runbook's check is a query for rows seen in the last seven
 * days (docs/runbooks/coreedge-step-up.md).
 *
 * SAMPLED, so a hot unscoped path cannot turn the guard into a write per
 * query: per process, the first violation at a call site is written at once
 * and later ones are counted and folded into the next write at least a minute
 * later. The first sighting — the fact the 7-day check needs — is never held
 * back; a tail count can be lost when an idle instance is frozen. Never
 * awaited: the query runs on regardless, and a transaction holding the only
 * pooled connection must not wait on a second one.
 */

export interface TenantGuardViolationSample {
  readonly model: string;
  readonly operation: string;
  /** Best-effort: the first application frame of the query's stack. */
  readonly callSite: string;
  /** Violations at this site since the last write from this process. */
  readonly count: number;
}

export type TenantGuardViolationRecorder = (sample: TenantGuardViolationSample) => Promise<void>;

const VIOLATION_FLUSH_MS = 60_000;
/** Distinct call sites tracked per process; past this they share one bucket. */
const MAX_TRACKED_SITES = 500;

let violationRecorder: TenantGuardViolationRecorder | null = null;
const violationSites = new Map<string, { unrecorded: number; lastRecordedAt: number }>();

/** Registered once by lib/db/prisma; null switches recording off (tests). */
export function setTenantGuardViolationRecorder(recorder: TenantGuardViolationRecorder | null): void {
  violationRecorder = recorder;
  violationSites.clear();
}

/**
 * The first stack frame outside the guard, Prisma and Node: the code that
 * issued the query. In a production bundle it is a chunk path, which still
 * names the route; "unknown" when nothing is left.
 */
export function violationCallSite(stack: string | undefined): string {
  for (const line of (stack ?? "").split("\n").slice(1)) {
    const frame = /\(?((?:file:\/\/)?\/[^\s()]+?)(?::\d+){0,2}\)?\s*$/.exec(line.trim())?.[1];
    if (!frame) continue;
    if (/node_modules|node:internal|\/tenant-guard\.|\/lib\/db\/prisma\./.test(frame)) continue;
    const appPath = /(?:\/src\/|\/\.next\/server\/).*/.exec(frame)?.[0];
    return (appPath ?? frame).slice(0, 300);
  }
  return "unknown";
}

function noteViolation(model: string, operation: string): void {
  const record = violationRecorder;
  if (!record) return;
  const tracked = violationSites.size < MAX_TRACKED_SITES;
  const callSite = tracked ? violationCallSite(new Error().stack) : "overflow";
  const key = `${model}|${operation}|${callSite}`;
  const site = violationSites.get(key) ?? { unrecorded: 0, lastRecordedAt: 0 };
  violationSites.set(key, site);
  site.unrecorded += 1;

  const now = Date.now();
  if (now - site.lastRecordedAt < VIOLATION_FLUSH_MS) return;
  const count = site.unrecorded;
  site.unrecorded = 0;
  site.lastRecordedAt = now;
  void record({ model, operation, callSite, count }).catch((err: unknown) => {
    console.error("[tenant-scope-guard] failed to record a violation", { model, operation, callSite, err });
  });
}

export class MissingTenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} was called without an organizationId. Tenant-anchored models must be scoped — use lib/studio/tenant-scope helpers, or declare a deliberate cross-tenant context via permitCrossTenantReads.`,
    );
    this.name = "MissingTenantScopeError";
  }
}

/**
 * Build the extension. Kept as a factory so tests can construct it without a
 * live client.
 */
export function tenantScopeGuard() {
  return {
    name: "requireTenantScope",
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (
            model &&
            (TENANT_ANCHORED_MODELS as readonly string[]).includes(model) &&
            SCOPED_OPERATIONS.has(operation) &&
            !whereHasOrganization(args) &&
            !isUnscopedByDesign(model, operation, args) &&
            crossTenantContext?.getStore() === undefined
          ) {
            const mode = tenantGuardMode();
            if (mode === "throw") {
              throw new MissingTenantScopeError(model, operation);
            }
            if (mode === "log") {
              console.error(
                `[tenant-scope-guard] unscoped ${model}.${operation} permitted in log mode — burn this down, then flip TENANT_SCOPE_GUARD=throw`,
              );
              noteViolation(model, operation);
            }
          }
          return query(args);
        },
      },
    },
  } satisfies Prisma.Extension | Record<string, unknown>;
}
