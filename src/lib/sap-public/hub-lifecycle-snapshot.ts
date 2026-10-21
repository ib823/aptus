/**
 * P0.8 — SAP's lifecycle data for the API catalogue, from the COMMITTED
 * snapshot, applied on deploy.
 *
 * THE DEFECT. Production's 954 S/4 Public API rows all had `hubState` null, so
 * the 61 that SAP marks DEPRECATED rendered like any other API. The columns
 * exist (2608 WS2) and the committed catalogue drop carries the values, but no
 * path ever moved them into the database the console reads:
 *   - the deployed API-reference import dropped the lifecycle fields when it
 *     wrote SapApiReference, and
 *   - the Rebuild's projection into SapHubContent never copied them,
 * and the only path that did write them (`pnpm sap:catalog:import`) needs a
 * laptop with the production DATABASE_URL. Both routes are fixed in the same
 * change; this module is what brings an EXISTING deployment up to date without
 * anyone pressing a button.
 *
 * THE SOURCE. `sap-references/api-hub-catalog.json`: SAP's anonymous
 * Business Accelerator Hub catalogue (https://api.sap.com/odata/1.0/catalog.svc),
 * harvested by scripts/harvest-sap-api-hub.ts; its `_provenance.harvestedAt`
 * dates it (2026-09-05 for the drop this change shipped with). Successors come
 * from `sap-references/api-successors.json` (hub-successors.ts) — the anonymous
 * feed has no successor field, so a successor is recorded only where SAP names
 * one, never inferred.
 *
 * WHAT IT WRITES, AND ONLY THAT. The six lifecycle columns (hubState,
 * hubVersion, hubModifiedAt, hubSubType, catalogueRelease, successorExternalId)
 * on rows that ALREADY EXIST, matched by id. It never creates or deletes a row,
 * never touches titles, editions, apiType, `status`, `rawMetadataJson` (where
 * every tenant's stored probe lives) or `updatedAt` (which Catalogue Health
 * reads as "when the catalogue was last imported" — a lifecycle stamp from a
 * dated snapshot is not a re-import, and bumping it would report a stale
 * catalogue CURRENT, the A29 defect).
 *
 * SAFE TO RUN ON EVERY DEPLOY.
 *   - Idempotent: a row whose values already match is not written, so the
 *     second run changes nothing.
 *   - Never reverts newer data: a row already stamped from a LATER Hub
 *     modification (an admin import of a fresher harvest) is left alone.
 *   - A recorded successor is never overwritten; one is only filled in.
 *   - One statement per table, so a failure leaves either the whole table
 *     stamped or none of it, and no network access is needed: the file is in
 *     the build's checkout.
 */

import { normalizeHubState } from "@/lib/sap-public/hub-import";
import { successorFor } from "@/lib/sap-public/hub-successors";

/** Where the committed API catalogue drop lives (same file the importers read). */
export const HUB_LIFECYCLE_SNAPSHOT_PATH = "sap-references/api-hub-catalog.json";

/**
 * The deploy-time switch. `apply` (the default) stamps; `off` skips, for a
 * deploy that must not touch catalogue data. Anything else reads as `apply`
 * with a warning, so a typo cannot silently disable it nor block a deploy.
 */
export type HubLifecycleOnDeploy = "apply" | "off";

export function hubLifecycleOnDeploy(env: Readonly<Record<string, string | undefined>> = process.env): {
  mode: HubLifecycleOnDeploy;
  warning: string | null;
} {
  const raw = (env.HUB_LIFECYCLE_ON_DEPLOY ?? "").trim().toLowerCase();
  if (raw === "" || raw === "apply") return { mode: "apply", warning: null };
  if (raw === "off") return { mode: "off", warning: null };
  return {
    mode: "apply",
    warning: `HUB_LIFECYCLE_ON_DEPLOY="${env.HUB_LIFECYCLE_ON_DEPLOY}" is not "apply" or "off"; applying.`,
  };
}

/** One API's lifecycle, as the snapshot states it. */
export interface HubLifecycleRecord {
  externalId: string;
  hubState: string;
  hubVersion: string | null;
  /** ISO 8601, or null when the snapshot has no usable date. */
  hubModifiedAt: string | null;
  hubSubType: string | null;
  catalogueRelease: string | null;
  successorExternalId: string | null;
}

export interface HubLifecycleSnapshot {
  /** The snapshot's own provenance line, for the deploy log. */
  source: string | null;
  harvestedAt: string | null;
  records: HubLifecycleRecord[];
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function isoOrNull(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /\/Date\((-?\d+)\)\//.exec(s);
  const d = m ? new Date(Number(m[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The lifecycle records a snapshot file states. Pure.
 *
 * ONLY AN EXPLICIT `hubState` COUNTS. The importers' normalizers fall back to
 * `state`/`status` when a row has no hubState, which is right for a full
 * import and wrong here: a stamp that runs on every deploy must assert only
 * what the snapshot says about SAP's lifecycle, never re-read a release status
 * ("Released") as one. A row with no hubState is not a record.
 *
 * One record per id; if the snapshot lists an id twice, the later Hub
 * modification wins.
 */
export function parseHubLifecycleSnapshot(json: unknown): HubLifecycleSnapshot {
  const root = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const rows: unknown[] = Array.isArray(json) ? json : Array.isArray(root?.apis) ? (root!.apis as unknown[]) : [];
  const provenance =
    root?._provenance && typeof root._provenance === "object" ? (root._provenance as Record<string, unknown>) : null;

  const byId = new Map<string, HubLifecycleRecord>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const externalId = str(r.apiId) ?? str(r.externalId);
    const hubState = normalizeHubState(r.hubState);
    if (!externalId || !hubState) continue;
    const record: HubLifecycleRecord = {
      externalId,
      hubState,
      hubVersion: str(r.hubVersion),
      hubModifiedAt: isoOrNull(r.hubModifiedAt),
      hubSubType: str(r.hubSubType),
      catalogueRelease: str(r.catalogueRelease),
      successorExternalId: str(r.successorExternalId) ?? successorFor(externalId),
    };
    const prior = byId.get(externalId);
    if (!prior || (record.hubModifiedAt ?? "") >= (prior.hubModifiedAt ?? "")) byId.set(externalId, record);
  }
  return {
    source: str(provenance?.source),
    harvestedAt: str(provenance?.harvestedAt),
    records: [...byId.values()],
  };
}

/** Anything with Prisma's `$executeRawUnsafe` — the app client, a script's own, a test's. */
export interface RawExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * THE STATEMENT, ONE SHAPE FOR BOTH TABLES. `$1` is the records as one JSON
 * array, unpacked in the database, so 5,000 rows are one round trip.
 *
 *   - matched by id, existing rows only (UPDATE … FROM; no INSERT);
 *   - skipped when the row's stored Hub modification is LATER than the
 *     snapshot's (a fresher import already stamped it);
 *   - skipped when nothing would change (idempotent: `IS DISTINCT FROM` on
 *     every column it writes, the successor only when it is being filled);
 *   - successorExternalId is COALESCEd — an existing one is never replaced.
 *
 * `updatedAt` is deliberately not set (see the module header).
 */
function stampSql(table: '"SapApiReference"' | '"SapHubContent"', idColumn: '"apiId"' | '"externalId"', extraWhere: string): string {
  return `
    UPDATE ${table} AS t
    SET "hubState" = s."hubState",
        "hubVersion" = s."hubVersion",
        "hubModifiedAt" = s."hubModifiedAt",
        "hubSubType" = s."hubSubType",
        "catalogueRelease" = s."catalogueRelease",
        "successorExternalId" = COALESCE(t."successorExternalId", s."successorExternalId")
    FROM (
      SELECT x."externalId",
             x."hubState",
             x."hubVersion",
             (x."hubModifiedAt")::timestamptz AT TIME ZONE 'UTC' AS "hubModifiedAt",
             x."hubSubType",
             x."catalogueRelease",
             x."successorExternalId"
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "externalId" text,
        "hubState" text,
        "hubVersion" text,
        "hubModifiedAt" text,
        "hubSubType" text,
        "catalogueRelease" text,
        "successorExternalId" text
      )
    ) AS s
    WHERE t.${idColumn} = s."externalId"
      ${extraWhere}
      AND (t."hubModifiedAt" IS NULL OR s."hubModifiedAt" IS NULL OR s."hubModifiedAt" >= t."hubModifiedAt")
      AND (
        t."hubState" IS DISTINCT FROM s."hubState"
        OR t."hubVersion" IS DISTINCT FROM s."hubVersion"
        OR t."hubModifiedAt" IS DISTINCT FROM s."hubModifiedAt"
        OR t."hubSubType" IS DISTINCT FROM s."hubSubType"
        OR t."catalogueRelease" IS DISTINCT FROM s."catalogueRelease"
        OR (t."successorExternalId" IS NULL AND s."successorExternalId" IS NOT NULL)
      )`;
}

export const STAMP_API_REFERENCE_SQL = stampSql('"SapApiReference"', '"apiId"', "");
export const STAMP_HUB_CONTENT_SQL = stampSql('"SapHubContent"', '"externalId"', `AND t."contentType" = 'API'`);

export interface HubLifecycleApplyResult {
  apiReferenceRows: number;
  hubContentRows: number;
}

/** Stamp both tables from the records. Returns how many rows each statement changed. */
export async function applyHubLifecycle(
  db: RawExecutor,
  records: readonly HubLifecycleRecord[],
): Promise<HubLifecycleApplyResult> {
  if (records.length === 0) return { apiReferenceRows: 0, hubContentRows: 0 };
  const payload = JSON.stringify(records);
  const apiReferenceRows = await db.$executeRawUnsafe(STAMP_API_REFERENCE_SQL, payload);
  const hubContentRows = await db.$executeRawUnsafe(STAMP_HUB_CONTENT_SQL, payload);
  return { apiReferenceRows, hubContentRows };
}
