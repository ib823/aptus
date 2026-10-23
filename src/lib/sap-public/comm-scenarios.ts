/**
 * Which SAP communication scenarios enable a service: the join of a service's
 * address to SAP's own table of them (roadmap P1.2, "ask Basis for
 * SAP_COM_xxxx").
 *
 * THE TABLE. SapCommScenario is SAP's "Available Interfaces for Your Selected
 * Scope" for S/4HANA Cloud Public Edition, loaded per content release
 * (scripts/load-2608-harvest.ts). It names a service by its TECHNICAL id, not
 * by the Business Accelerator Hub's apiId:
 *
 *   OData V2   <TECHNICAL_NAME>_<4-digit version>     API_SUPPLIERINVOICE_PROCESS_SRV_0001,
 *                                                     /CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV_0001
 *   OData V4   <SERVICE GROUP>_G4BA                   API_PURCHASEORDER_2_G4BA
 *              (or <GROUP>_<version>_G4BA)            API_SALESORDER_0001_G4BA
 *
 * The V4 form is observed in the data, not documented [unverified]. So the
 * join is keyed by the technical id TAKEN FROM THE ADDRESS CoreEdge calls
 * (technicalIdsForAddress), never by a guess from the Hub id: measured on the
 * committed files, the address rule matches 180 of the 211 S/4 Public V2
 * catalogue rows exactly, and Hub-id name heuristics match 9 of 246 V4 rows.
 * A V4 address is joined only when it is known (KNOWN_V4_SERVICE_PATHS) or a
 * tenant listed it; a derived one is a guess, and a guess shown as "Enabled
 * by SAP_COM_0057" is the claim the catalogue's honest-status rule forbids.
 *
 * ONE RELEASE. The table is loaded per release and two may be loaded; the join
 * reads the newest release that has scenario rows, in the same statement.
 *
 * PUBLIC EDITION ONLY. The table is S/4HANA Cloud Public Edition
 * documentation; callers ask it only for that product.
 *
 * CLIENT-SAFE: the database is a parameter, and only its type is imported.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** The product whose documentation SAP's communication scenario table is: S/4HANA Cloud Public Edition. */
export const SCENARIO_TABLE_PRODUCT = "s4hana";

/** Where the scenarios come from, as the screen names it. */
export const SCENARIO_SOURCE = "help.sap.com, Available Interfaces for Your Selected Scope";

/** One scenario that lists a service. */
export interface ScenarioRef {
  readonly id: string;
  /** SAP's name, where SAP names it (62 of 496 in 2608); null otherwise, never "Unknown". */
  readonly name: string | null;
  readonly direction: string | null;
  /** How many interfaces the scenario lists in all: what activating it also opens. */
  readonly interfaceCount: number;
}

export interface ScenarioJoin {
  /** The release the scenarios were read from; null when nothing matched. */
  readonly release: string | null;
  /** By the technical id asked for: the scenarios that list it, by id. */
  readonly byId: ReadonlyMap<string, readonly ScenarioRef[]>;
}

const GATEWAY_V2 = /^\/sap\/opu\/odata\/([^/;]+)\/([^/;]+)(?:;v=(\d{1,4}))?$/i;
const GATEWAY_V4 = /^\/sap\/opu\/odata4\/[^/]+\/([^/]+)\/(?:srvd(?:_a2x)?)\/[^/]+\/[^/]+\/(\d{4})$/i;

/**
 * The technical ids the table may name the service at this address by,
 * upper-cased; none when the address is not a Gateway service root.
 *
 *   /sap/opu/odata/sap/API_X_SRV          → API_X_SRV_0001
 *   /sap/opu/odata/sap/API_X_SRV;v=0002   → API_X_SRV_0002
 *   /sap/opu/odata/CPD/SC_X_SRV           → /CPD/SC_X_SRV_0001
 *   /sap/opu/odata4/sap/api_x_2/srvd_a2x/sap/x/0001
 *                                         → API_X_2_G4BA, API_X_2_0001_G4BA
 */
export function technicalIdsForAddress(address: { readonly path: string; readonly protocol?: "ODATAV2" | "ODATAV4" | null }): string[] {
  const path = address.path.replace(/\/+$/, "");
  if (address.protocol !== "ODATAV4") {
    const v2 = GATEWAY_V2.exec(path);
    if (v2) {
      const namespace = v2[1]!.toUpperCase();
      const name = v2[2]!.toUpperCase();
      const version = (v2[3] ?? "1").padStart(4, "0");
      return [namespace === "SAP" ? `${name}_${version}` : `/${namespace}/${name}_${version}`];
    }
    if (address.protocol === "ODATAV2") return [];
  }
  const v4 = GATEWAY_V4.exec(path);
  if (!v4) return [];
  const group = v4[1]!.toUpperCase();
  return [`${group}_G4BA`, `${group}_${v4[2]}_G4BA`];
}

/** The scenario ids a curated service's `scenario` field names ("SAP_COM_0053 / 0054 / 0057" is three). */
export function namedScenarioIds(field: string): string[] {
  const out: string[] = [];
  for (const m of field.matchAll(/(SAP_COM_)?(\d{4})/g)) {
    const id = `SAP_COM_${m[2]}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

type Db = Pick<PrismaClient, "$queryRaw"> | Pick<Prisma.TransactionClient, "$queryRaw">;

interface JoinRow {
  id: string;
  name: string | null;
  direction: string | null;
  interfaceCount: number;
  matched: string[];
  release: string;
}

/**
 * The scenarios that list each of these technical ids, from the newest
 * release with scenario rows: ONE statement (the release is a subquery, the
 * match uses the GIN index on apiIds). Exact ids only.
 */
export async function scenariosForServices(db: Db, ids: readonly string[]): Promise<ScenarioJoin> {
  const wanted = [...new Set(ids.map((i) => i.toUpperCase()))];
  const byId = new Map<string, ScenarioRef[]>();
  if (wanted.length === 0) return { release: null, byId };
  const rows = await (db as Pick<PrismaClient, "$queryRaw">).$queryRaw<JoinRow[]>`
    WITH rel AS (
      SELECT r."id", r."release" FROM "SapContentRelease" r
      WHERE EXISTS (SELECT 1 FROM "SapCommScenario" x WHERE x."releaseId" = r."id")
      ORDER BY r."release" DESC, r."loadedAt" DESC
      LIMIT 1
    )
    SELECT s."commScenarioId" AS "id", s."name", s."direction",
           cardinality(s."apiIds")::int AS "interfaceCount",
           ARRAY(SELECT a FROM unnest(s."apiIds") AS a WHERE a = ANY(${wanted}::text[])) AS "matched",
           rel."release"
    FROM "SapCommScenario" s
    JOIN rel ON s."releaseId" = rel."id"
    WHERE s."apiIds" && ${wanted}::text[]
    ORDER BY s."commScenarioId"`;
  for (const row of rows) {
    const ref: ScenarioRef = { id: row.id, name: row.name, direction: row.direction, interfaceCount: Number(row.interfaceCount) };
    for (const id of row.matched) {
      const list = byId.get(id) ?? [];
      list.push(ref);
      byId.set(id, list);
    }
  }
  return { release: rows[0]?.release ?? null, byId };
}

/** The newest content release that has scenario rows, or null (a script's and a test's read). */
export async function currentScenarioRelease(db: Db): Promise<{ id: string; release: string } | null> {
  const rows = await (db as Pick<PrismaClient, "$queryRaw">).$queryRaw<{ id: string; release: string }[]>`
    SELECT r."id", r."release" FROM "SapContentRelease" r
    WHERE EXISTS (SELECT 1 FROM "SapCommScenario" x WHERE x."releaseId" = r."id")
    ORDER BY r."release" DESC, r."loadedAt" DESC
    LIMIT 1`;
  return rows[0] ?? null;
}

/** The scenarios of the first of `ids` the join knows, or none. */
export function scenariosOf(join: ScenarioJoin, ids: readonly string[]): readonly ScenarioRef[] {
  for (const id of ids) {
    const found = join.byId.get(id.toUpperCase());
    if (found && found.length > 0) return found;
  }
  return [];
}

/**
 * The same join over rows already in hand (the committed table, in a test or
 * a report): what scenariosForServices answers for one release's rows.
 */
export function joinScenarioRows(
  rows: readonly { readonly id: string; readonly name: string | null; readonly direction: string | null; readonly apiIds: readonly string[] }[],
  ids: readonly string[],
  release: string,
): ScenarioJoin {
  const wanted = new Set(ids.map((i) => i.toUpperCase()));
  const byId = new Map<string, ScenarioRef[]>();
  let any = false;
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const ref: ScenarioRef = { id: row.id, name: row.name, direction: row.direction, interfaceCount: row.apiIds.length };
    for (const a of row.apiIds) {
      if (!wanted.has(a)) continue;
      any = true;
      const list = byId.get(a) ?? [];
      if (!list.includes(ref)) list.push(ref);
      byId.set(a, list);
    }
  }
  return { release: any ? release : null, byId };
}

/** What Discover's "Ask Basis" panel shows for one service. */
export interface AskBasis {
  /** True when the service is not shown as activated: the request to Basis is the next step. Otherwise information. */
  readonly action: boolean;
  readonly scenarios: readonly ScenarioRef[];
  readonly release: string | null;
  readonly source: string;
}

/** Is a service's status one the "Ask Basis" call to action applies to (not proven activated on this system)? */
export function askBasisApplies(status: string | null | undefined): boolean {
  return status !== "ACTIVATED";
}

/**
 * The request a builder copies to their Basis team: the scenario, the
 * service and the connection, in plain words. No credential, no host, and
 * nothing is sent: the screen copies it to the clipboard and no more.
 */
export function askBasisText(input: {
  readonly scenario: Pick<ScenarioRef, "id" | "name" | "interfaceCount">;
  readonly service: { readonly technicalId: string; readonly label?: string | null };
  readonly connectionLabel?: string | null;
  readonly release?: string | null;
}): string {
  const { scenario, service } = input;
  const named = scenario.name ? `${scenario.id} (${scenario.name})` : scenario.id;
  const system = input.connectionLabel ? `the system behind our connection "${input.connectionLabel}"` : "our SAP S/4HANA Cloud system";
  const others = Math.max(0, scenario.interfaceCount - 1);
  return [
    `Please set up a communication arrangement for communication scenario ${named} on ${system}, for the communication user our integration signs in with.`,
    `We need it for the service ${service.technicalId}${service.label ? ` (${service.label})` : ""}, which SAP lists under this scenario${input.release ? ` in release ${input.release}` : ""} (${SCENARIO_SOURCE}).`,
    others > 0
      ? `The scenario also enables ${others} other interface${others === 1 ? "" : "s"}; please check that is acceptable before activating it.`
      : "",
  ]
    .filter((s) => s !== "")
    .join(" ");
}
