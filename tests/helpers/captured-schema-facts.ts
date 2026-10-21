/**
 * What the database answers capturedSchemaFacts's query with
 * (response-schema-states.ts), computed in JS from in-memory interface rows —
 * for route tests whose prisma is a stand-in. The real query is tested
 * against PostgreSQL (tests/integration/response-schema-states.test.ts).
 *
 * The query's values are the organisation, then the ids asked for.
 */

type Row = Record<string, unknown>;

export function capturedSchemaFactRows(rows: readonly Row[], query: unknown): Row[] {
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
