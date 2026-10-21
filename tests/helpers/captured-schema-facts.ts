/**
 * What the database answers capturedSchemaFacts's query with
 * (response-schema-states.ts), computed in JS from in-memory interface rows —
 * for route tests whose prisma is a stand-in. The real query is tested
 * against PostgreSQL (tests/integration/response-schema-states.test.ts).
 *
 * The query's values are the organisation, then the ids asked for.
 */

type Row = Record<string, unknown>;

/** Whether a raw query is fixtureFacts's (fixture-store.ts), not capturedSchemaFacts's. */
export function isFixtureFactsQuery(query: unknown): boolean {
  const q = query as { sql?: string; strings?: readonly string[] } | null;
  return (q?.sql ?? q?.strings?.join("") ?? "").includes('"MockFixture"') && !isFixtureBodiesQuery(query);
}

/**
 * What the database answers fixtureFacts's query with (fixture-store.ts):
 * each fixture of the organisation's interface, its stamp, and its stored
 * body's size (compact JSON here; jsonb text in PostgreSQL). The query's
 * values are the organisation, then the interface.
 */
export function fixtureFactRows(rows: readonly Row[], query: unknown): Row[] {
  const [org, interfaceId] = ((query as { values?: unknown[] } | null)?.values ?? []) as unknown[];
  return rows
    .filter((r) => r.organizationId === org && r.interfaceId === interfaceId)
    .map((r) => ({
      id: r.id,
      scenario: r.scenario,
      status: r.status,
      sourceStatus: r.sourceStatus ?? null,
      capturedAt: r.capturedAt ?? new Date(0),
      interfaceVersion: r.interfaceVersion ?? null,
      entitySet: r.entitySet ?? null,
      bytes: Buffer.byteLength(JSON.stringify(r.body), "utf8"),
    }))
    .sort((a, b) => String(a.scenario).localeCompare(String(b.scenario)));
}

export function capturedSchemaFactRows(rows: readonly Row[], query: unknown): Row[] {
  if (isFixtureFactsQuery(query) || isFixtureBodiesQuery(query) || isSnapshotIrTextQuery(query) || isOtherContractQuery(query)) return [];
  const values = ((query as { values?: unknown[] } | null)?.values ?? []) as unknown[];
  const [org, ...ids] = values;
  return rows
    .filter((r) => (r.organizationId === undefined || r.organizationId === org) && ids.includes(r.id))
    .filter((r) => r.responseSchema !== null && r.responseSchema !== undefined)
    .map((r) => {
      const v = r.responseSchema as Row;
      const props = v && typeof v === "object" ? v.properties : undefined;
      const stamp = v && typeof v === "object" ? (v["x-captured"] as Row | undefined) : undefined;
      return {
        id: r.id,
        bytes: Buffer.byteLength(JSON.stringify(v), "utf8"),
        captured: !!v && typeof v === "object" && v.type === "object" && !!props && typeof props === "object",
        stampVersion: stamp && typeof stamp === "object" && typeof stamp.interfaceVersion === "number" ? stamp.interfaceVersion : null,
        stampEntitySet: stamp && typeof stamp === "object" && typeof stamp.entitySet === "string" ? stamp.entitySet : null,
      };
    });
}

/** Whether a raw query reads snapshots' IRs as their text (snapshot.ts, snapshotIrTexts). */
export function isSnapshotIrTextQuery(query: unknown): boolean {
  const q = query as { sql?: string; strings?: readonly string[] } | null;
  return (q?.sql ?? q?.strings?.join("") ?? "").includes('"ir"::text');
}

/**
 * Whether a raw statement is one of the contract paths' others
 * (raw-sql-standin.ts): a snapshot summary, a snapshot's bodies, the grants,
 * a JSON column written from its text — never capturedSchemaFacts's.
 */
function isOtherContractQuery(query: unknown): boolean {
  const q = query as { sql?: string; strings?: readonly string[] } | null;
  const sql = q?.sql ?? q?.strings?.join("") ?? "";
  return sql.includes('"ContractSnapshot"') || sql.includes('"ApiAccessGrant"') || /^\s*UPDATE /.test(sql);
}

/** What the database answers snapshotIrTexts's query with: each row's IR as JSON text. Values: the organisation, then the ids. */
export function snapshotIrTextRows(rows: readonly Row[], query: unknown): Row[] {
  const [org, ...ids] = ((query as { values?: unknown[] } | null)?.values ?? []) as unknown[];
  return rows
    .filter((r) => (r.organizationId === undefined || r.organizationId === org) && ids.includes(r.id))
    .map((r) => ({ id: r.id, ir: JSON.stringify(r.ir) }));
}

/** Whether a raw query reads fixture bodies as their text (fixture-store.ts, fixtureBodies). */
export function isFixtureBodiesQuery(query: unknown): boolean {
  const q = query as { sql?: string; strings?: readonly string[] } | null;
  return (q?.sql ?? q?.strings?.join("") ?? "").includes('"body"::text AS');
}

/** What the database answers fixtureBodies's query with. Values: the organisation, the interface, then the ids. */
export function fixtureBodyTextRows(rows: readonly Row[], query: unknown): Row[] {
  const [org, interfaceId, ...ids] = ((query as { values?: unknown[] } | null)?.values ?? []) as unknown[];
  return rows
    .filter((r) => r.organizationId === org && r.interfaceId === interfaceId && ids.includes(r.id))
    .map((r) => ({ id: r.id, body: JSON.stringify(r.body) }));
}
