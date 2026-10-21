/**
 * What PostgreSQL answers the contract read and write paths' raw statements
 * with, computed in JS from in-memory rows — for route tests whose prisma is
 * a stand-in (structural hardening round 5). The real statements are tested
 * against PostgreSQL (tests/integration/hardening-round5.test.ts).
 *
 *   currentSnapshotSummaries  one DISTINCT ON over the snapshots (snapshot.ts)
 *   snapshotBodies            two capabilities and the singleton flag of an IR
 *   planDocInputs's grants    the granting, unexpired, unrevoked rows, distinct
 *   jsonTextUpdate            a row's JSON columns set from their text (json-text.ts)
 */

type Row = Record<string, unknown>;
interface RawQuery {
  sql?: string;
  text?: string;
  strings?: readonly string[];
  values?: unknown[];
}

const sqlOf = (q: unknown): string => {
  const r = q as RawQuery | null;
  return r?.text ?? r?.sql ?? r?.strings?.join("") ?? "";
};
const valuesOf = (q: unknown): unknown[] => ((q as RawQuery | null)?.values ?? []) as unknown[];

/** currentSnapshotSummaries's statement (snapshot.ts). */
export function isSnapshotSummariesQuery(q: unknown): boolean {
  return sqlOf(q).includes('DISTINCT ON (s."interfaceId")');
}

const newestFirst = (a: Row, b: Row): number =>
  (b.semverMajor as number) - (a.semverMajor as number) ||
  (b.semverMinor as number) - (a.semverMinor as number) ||
  (b.semverPatch as number) - (a.semverPatch as number);

/** Each wanted interface's newest snapshot describing it now. Values: ids, externalIds, entitySets, the organisation. */
export function snapshotSummaryRows(snapshots: readonly Row[], q: unknown): Row[] {
  const [ids, exts, sets, org] = valuesOf(q) as [string[], string[], string[], string];
  const out: Row[] = [];
  ids.forEach((id, i) => {
    const hit = snapshots
      .filter((r) => (r.organizationId ?? org) === org && r.interfaceId === id && r.externalId === exts[i] && r.entitySet === sets[i])
      .sort(newestFirst)[0];
    if (hit && !out.some((o) => o.interfaceId === id)) {
      out.push({
        interfaceId: hit.interfaceId,
        id: hit.id,
        semver: hit.semver,
        contentHash: hit.contentHash,
        source: hit.source,
        odataVersion: hit.odataVersion,
        entitySet: hit.entitySet,
        externalId: hit.externalId,
        interfaceVersion: hit.interfaceVersion,
        createdAt: hit.createdAt ?? new Date(0),
        irBytes: hit.irBytes ?? null,
      });
    }
  });
  return out;
}

/** snapshotBodies's statement (snapshot.ts). */
export function isSnapshotBodiesQuery(q: unknown): boolean {
  return sqlOf(q).includes("->'capabilities'");
}

/** The source and the three flags of one snapshot's IR. Values: the organisation, the id. */
export function snapshotBodiesRows(snapshots: readonly Row[], q: unknown): Row[] {
  const [org, id] = valuesOf(q) as [string, string];
  const row = snapshots.find((r) => (r.organizationId ?? org) === org && r.id === id);
  if (!row) return [];
  const ir = (typeof row.ir === "string" ? JSON.parse(row.ir) : row.ir) as { entitySet?: { capabilities?: Row; singleton?: boolean } } | null;
  const text = (v: unknown) => (v === undefined || v === null ? null : String(v));
  return [
    {
      source: row.source,
      creatable: text(ir?.entitySet?.capabilities?.creatable),
      updatable: text(ir?.entitySet?.capabilities?.updatable),
      singleton: text(ir?.entitySet?.singleton),
    },
  ];
}

/** planDocInputs's grant statement (doc-inputs.ts). */
export function isGrantsQuery(q: unknown): boolean {
  return sqlOf(q).includes('"ApiAccessGrant"');
}

/** The granting, unexpired, unrevoked rows of the interfaces, distinct. Values: the organisation, the ids, now. */
export function grantRows(grants: readonly Row[], q: unknown): Row[] {
  const [org, ids, now] = valuesOf(q) as [string, string[], Date];
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const g of grants) {
    if ((g.organizationId ?? org) !== org || !ids.includes(g.interfaceId as string)) continue;
    if (g.revokedAt !== null && g.revokedAt !== undefined) continue;
    const expiresAt = g.expiresAt as Date | null | undefined;
    if (expiresAt && expiresAt.getTime() <= now.getTime()) continue;
    const granting = g.decision === "APPROVED" || g.decision === "READ_ONLY" || (g.decision === "SANDBOX_ONLY" && g.environment === "SANDBOX");
    if (!granting) continue;
    const key = `${g.interfaceId}|${g.operation}|${g.environment}|${g.decision}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ interfaceId: g.interfaceId, operation: g.operation, environment: g.environment, decision: g.decision });
  }
  return out;
}

/** jsonTextUpdate's statement (json-text.ts): which table. */
export function jsonTextUpdateTable(q: unknown): "ContractSnapshot" | "MockFixture" | null {
  const m = /^UPDATE "(ContractSnapshot|MockFixture)" SET/.exec(sqlOf(q).trim());
  return m ? (m[1] as "ContractSnapshot" | "MockFixture") : null;
}

/**
 * Apply jsonTextUpdate's statement to in-memory rows: each named column set
 * to its text, parsed, as jsonb stores it. The rows written.
 */
export function applyJsonTextUpdate(rows: Row[], q: unknown): number {
  const sql = sqlOf(q);
  const values = valuesOf(q);
  // The statement's columns in order; each set from the next value (its text) or NULL.
  const sets = [...sql.matchAll(/"(\w+)" = (\$\d+::jsonb|\?::jsonb|NULL)/g)].map((m) => ({ column: m[1]!, isNull: m[2] === "NULL" }));
  let n = 0;
  const assigned: Row = {};
  for (const s of sets) assigned[s.column] = s.isNull ? null : JSON.parse(values[n++] as string);
  const [id, org] = [values[n], values[n + 1]];
  let written = 0;
  for (const r of rows) {
    if (r.id === id && (r.organizationId ?? org) === org) {
      Object.assign(r, assigned);
      written += 1;
    }
  }
  return written;
}
