/**
 * ContractSnapshot persistence: record a compiled contract, and find the one
 * that describes an interface now (P1.3).
 *
 * ONE ROW PER CONTRACT, NOT PER COMPILE. Verifying the same service twice
 * compiles twice and records once. A row's contract never changes; what
 * changes is which row of an interface holds the /schema texts (below).
 *
 * ENVIRONMENTS ARE NOT IN STEP. DEV runs ahead of PROD by transports, so the
 * same interface verified in each describes two contracts at once, and
 * connections that log on in different languages describe the same structure
 * with different labels. So each environment is followed along its own rows
 * (the rows its verifies wrote; SAMPLED rows have none and are a line of
 * their own):
 *
 *   - the compile matches the environment's own newest row: UNCHANGED, that row;
 *   - it matches a row NEWER than that (or the environment has none): the
 *     environment is catching up to a contract another one already recorded —
 *     UNCHANGED, that row;
 *   - otherwise a new row. Its diff is against the environment's own newest
 *     row — for an environment's first verify, against whichever
 *     environment's newest row it is nearest to — and its version is the
 *     interface's latest bumped by that diff, so versions stay one ordered
 *     line. An environment going BACK to an older contract of its own is a
 *     new version — a field that disappeared is still a change.
 *   - THE LINE DECIDES THE BUMP TOO: the bump is the larger of the two,
 *     against the environment's own row and against the latest, so a
 *     consumer pinned to ^1.1 never loses a field in 1.2.0.
 *
 * THE DIFFS ARE TAKEN IN THE JOB. The heads a decision may need — the
 * environment's own newest row (or every environment's, for its first
 * verify) and the latest — are read before the job, as their stored text
 * (loadRecordHeads), and the record or capture job diffs the new contract
 * against each (jobs.ts). A decision that finds the history moved since (a
 * concurrent verify recorded meanwhile) refuses, and the next verify records.
 *
 * THE /SCHEMA TEXTS LIVE ON ONE ROW. The job renders what GET /schema serves
 * (jobs.ts, renderSchemaTexts), and the record writes the texts onto the row
 * that is now current for the interface — a new row, or an UNCHANGED one
 * re-attached, its texts rendered from its own stored IR (loadRecordHeads
 * hands the job the current row) — and nulls them on every other row of the
 * interface, in the same transaction as the row, its diff and the write
 * interface's stamp. An interface therefore holds at most 1 MiB of texts. A
 * row without them is served as NOT_RENDERED until the interface is verified
 * (or captured) again. Texts written by an earlier renderer are served as
 * they are — a self-consistent render of the row's own IR — until the
 * interface's next verify or capture renders them again: nothing re-renders
 * stored rows outside a job charged to their organisation (consolidated
 * review round 5).
 *
 * WHICH ONE IS CURRENT. The newest snapshot whose service (externalId) and
 * dataset match the interface now. Pointing the interface at another dataset
 * or service makes none current until that one is verified.
 *
 * THE HISTORY IS BOUNDED. Every decision asks the database for the one row
 * it needs, an indexed lookup whatever the history; and when a row is
 * recorded, rows older than the newest LIMITS.snapshotHistory are removed,
 * except each environment's newest.
 */

import { Prisma } from "@prisma/client";

import { jsonBytesUpTo, LIMITS } from "@/lib/contracts/budget";
import { MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
import { nextSemver, semverParts, type Bump, type StoredContractDiff } from "@/lib/contracts/diff";
import type { InterfaceContract } from "@/lib/contracts/ir";
import type { PreviousHeads, RecordableContract } from "@/lib/contracts/jobs";
import { jsonTextRef } from "@/lib/contracts/render-input";
import { JSON_TEXT_PLACEHOLDER, setJsonText, type RawExecutor } from "@/lib/db/json-text";
import { prisma } from "@/lib/db/prisma";
import { scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

export interface SnapshotSummary {
  id: string;
  semver: string;
  contentHash: string;
  source: "METADATA" | "SAMPLED";
  odataVersion: string;
  entitySet: string;
  externalId: string;
  interfaceVersion: number;
  createdAt: Date;
}

/** What a recorded version's diff says to the verify: its bump and its first changes, as sentences. */
export interface RecordedDiff {
  bump: Bump | null;
  changes: string[];
  /** How many changes the stored diff left out (storedDiff); absent when none were. */
  omitted?: number;
}

export interface CurrentSnapshot extends SnapshotSummary {
  contract: InterfaceContract;
}

export type RecordOutcome =
  | { status: "RECORDED"; snapshot: SnapshotSummary; diff: RecordedDiff | null }
  | { status: "UNCHANGED"; snapshot: SnapshotSummary }
  /** The history moved while the job ran: nothing stored. */
  | { status: "REFUSED"; detail: string };

/** The largest contract stored, as canonical JSON (defined beside the digest it bounds). */
export { MAX_CONTRACT_BYTES };

const SUMMARY_SELECT = {
  id: true,
  semver: true,
  contentHash: true,
  source: true,
  odataVersion: true,
  entitySet: true,
  externalId: true,
  interfaceVersion: true,
  createdAt: true,
} as const;

const NEWEST_FIRST = [{ semverMajor: "desc" }, { semverMinor: "desc" }, { semverPatch: "desc" }] as const;

/**
 * Every environment a snapshot is recorded under: the four a connection may
 * declare (SapEnvironment) and none (a sampled capture). The newest row of
 * each is read by name, one indexed lookup each, never by reading them all.
 */
const SNAPSHOT_ENVIRONMENTS: readonly (string | null)[] = [null, "SANDBOX", "DEV", "TEST", "PROD"];

function summary(row: {
  id: string;
  semver: string;
  contentHash: string;
  source: string;
  odataVersion: string;
  entitySet: string;
  externalId: string;
  interfaceVersion: number;
  createdAt: Date;
}): SnapshotSummary {
  return {
    id: row.id,
    semver: row.semver,
    contentHash: row.contentHash,
    source: row.source === "SAMPLED" ? "SAMPLED" : "METADATA",
    odataVersion: row.odataVersion,
    entitySet: row.entitySet,
    externalId: row.externalId,
    interfaceVersion: row.interfaceVersion,
    createdAt: row.createdAt,
  };
}

/** A job's text (UTF-8 bytes, jobs.ts) as the string a write takes. */
const decoder = new TextDecoder();
const textOf = (t: Uint8Array) => decoder.decode(t);

const bumpRank = (b: Bump | null): number => (b === null ? 0 : b === "patch" ? 1 : b === "minor" ? 2 : 3);

/** Is version a later than version b? */
function laterThan(a: string, b: string): boolean {
  const [x, y] = [semverParts(a), semverParts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

type HeadRow = SnapshotSummary & { environment: string | null };

/** The newest row of the interface matching `where`. */
async function newest(scope: TenantScope, interfaceId: string, where: Prisma.ContractSnapshotWhereInput): Promise<HeadRow | null> {
  const row = await prisma.contractSnapshot.findFirst({
    where: scopedWhere(scope, { interfaceId, ...where }),
    orderBy: [...NEWEST_FIRST],
    select: { ...SUMMARY_SELECT, environment: true },
  });
  return row ? { ...summary(row), environment: row.environment } : null;
}

/** Each environment's newest row of the interface, newest first: one indexed lookup per environment. */
async function environmentHeads(scope: TenantScope, interfaceId: string): Promise<HeadRow[]> {
  const heads = await Promise.all(SNAPSHOT_ENVIRONMENTS.map((environment) => newest(scope, interfaceId, { environment })));
  return heads
    .filter((h): h is HeadRow => h !== null)
    .sort((a, b) => (laterThan(a.semver, b.semver) ? -1 : laterThan(b.semver, a.semver) ? 1 : 0));
}

/** The rows a decision may diff against: the environment's own newest (or every environment's), and the latest. */
async function decisionRows(scope: TenantScope, interfaceId: string, environment: string | null) {
  const [latest, own] = await Promise.all([newest(scope, interfaceId, {}), newest(scope, interfaceId, { environment })]);
  const candidates = latest === null ? [] : own ? [own] : await environmentHeads(scope, interfaceId);
  return { latest, own, candidates };
}

/** The heads a record or capture job diffs against, as their stored text, and which row each is. */
export interface RecordHeads extends PreviousHeads {
  /** The row whose IR is previous[i]. */
  ids: string[];
  /** The row `current` is (the interface's current row, its texts rendered from its own IR); null when none. */
  currentId: string | null;
}

/**
 * The heads a record of this interface in this environment may need
 * (decisionRows), read AS THEIR STORED TEXT (`ir::text`) for the job to parse:
 * at most six, never parsed on this thread. And the hashes whose record is
 * certainly UNCHANGED, for which the job takes no diff.
 */
export async function loadRecordHeads(
  scope: TenantScope,
  iface: { id: string; externalId: string; entitySet: string | null },
  environment: string | null,
): Promise<RecordHeads> {
  const [{ latest, own, candidates }, current] = await Promise.all([
    decisionRows(scope, iface.id, environment),
    // The row /schema serves now: an UNCHANGED record renders its texts from this row's own IR (jobs.ts).
    iface.entitySet ? newest(scope, iface.id, { externalId: iface.externalId, entitySet: iface.entitySet }) : Promise.resolve(null),
  ]);
  const ids = [...new Set([...candidates, ...(latest ? [latest] : [])].map((r) => r.id))];
  const wanted = current && !ids.includes(current.id) ? [...ids, current.id] : ids;
  const texts =
    wanted.length === 0
      ? []
      : await prisma.$queryRaw<{ id: string; ir: string }[]>(Prisma.sql`
          SELECT "id", "ir"::text AS "ir" FROM "ContractSnapshot"
          WHERE "organizationId" = ${scope.organizationId} AND "id" IN (${Prisma.join(wanted)})
        `);
  const byId = new Map(texts.map((t) => [t.id, t.ir]));
  const present = ids.filter((id) => byId.has(id));
  const unchangedHashes = [latest, own].filter((r): r is HeadRow => r !== null && r.externalId === iface.externalId).map((r) => r.contentHash);
  const currentIr = current ? byId.get(current.id) : undefined;
  return {
    ids: present,
    previous: present.map((id) => byId.get(id)!),
    unchangedHashes,
    current: current && currentIr !== undefined ? { hash: current.contentHash, ir: currentIr } : null,
    currentId: current && currentIr !== undefined ? current.id : null,
  };
}

/** The current snapshot of an interface, read in a transaction: what the texts and the stamp are decided by. */
async function currentIn(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  iface: { id: string; externalId: string; entitySet: string },
): Promise<HeadRow | null> {
  const row = await tx.contractSnapshot.findFirst({
    where: scopedWhere(scope, { interfaceId: iface.id, externalId: iface.externalId, entitySet: iface.entitySet }),
    orderBy: [...NEWEST_FIRST],
    select: { ...SUMMARY_SELECT, environment: true },
  });
  return row ? { ...summary(row), environment: row.environment } : null;
}

const HISTORY_MOVED =
  "Another verify recorded a version of this contract while this one was being compiled, so it was not recorded. Verify again.";

/** What a record writes besides the row and its texts, in the same transaction: given the outcome and the current row. */
export type AlsoWrite = (tx: Prisma.TransactionClient, outcome: { snapshot: SnapshotSummary }, current: SnapshotSummary | null) => Promise<void>;

/**
 * Record a contract the job made ready (jobs.ts, RecordableContract): decide
 * UNCHANGED or a new version from the diffs the job took against `heads`,
 * and write in ONE transaction the row (or nothing, when UNCHANGED), its IR
 * and diff, the /schema texts on the interface's current row and none on any
 * other, and whatever `alsoWrite` adds (the write body's stamp; a capture's
 * schema). Whatever `alsoWrite` throws undoes all of it and is thrown here.
 */
export async function recordContractSnapshot(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string };
  contract: Extract<RecordableContract, { ok: true }>;
  /** The rows the job diffed against, and the current row it rendered an UNCHANGED contract's texts from (loadRecordHeads). */
  heads: { ids: readonly string[]; currentId?: string | null };
  environment?: string | null;
  connectionId?: string | null;
  createdById?: string | null;
  alsoWrite?: AlsoWrite;
}): Promise<RecordOutcome> {
  const { scope, iface, contract } = input;
  const environment = input.environment ?? null;
  const hash = contract.hash;

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ latest, own, candidates }, match] = await Promise.all([
      decisionRows(scope, iface.id, environment),
      // The newest row of this very contract, from this service.
      newest(scope, iface.id, { contentHash: hash, externalId: iface.externalId }),
    ]);
    let outcome: Extract<RecordOutcome, { status: "RECORDED" | "UNCHANGED" }> | null = null;
    if (own && own.contentHash === hash && own.externalId === iface.externalId) outcome = { status: "UNCHANGED", snapshot: own };
    // It counts only if it is past this environment's own.
    else if (match && (!own || laterThan(match.semver, own.semver))) outcome = { status: "UNCHANGED", snapshot: match };

    /** The new row's version and its diff, as its text. */
    let next: { semver: string; diffText: string | null; diff: RecordedDiff | null } | null = null;
    if (outcome === null) {
      next = { semver: "1.0.0", diffText: null, diff: null };
      if (latest) {
        // Every diff this decision needs was taken by the job, against these rows: else the history moved.
        const diffOf = (id: string) => {
          const i = input.heads.ids.indexOf(id);
          return i >= 0 && contract.diffs ? (contract.diffs[i] ?? null) : null;
        };
        const rows = [...candidates, latest];
        if (rows.some((r) => diffOf(r.id) === null)) return { status: "REFUSED", detail: HISTORY_MOVED };
        // The smallest bump among the candidates, the newer on a tie (they are newest first)…
        let chosen = { row: candidates[0]!, diff: diffOf(candidates[0]!.id)! };
        for (const row of candidates.slice(1)) {
          const d = diffOf(row.id)!;
          if (bumpRank(d.bump) < bumpRank(chosen.diff.bump)) chosen = { row, diff: d };
        }
        // …and never a smaller bump than the line itself changed.
        const onLine = diffOf(latest.id)!;
        if (chosen.row.id !== latest.id && bumpRank(onLine.bump) > bumpRank(chosen.diff.bump)) chosen = { row: latest, diff: onLine };
        if (chosen.diff.bump === null) {
          // Same structure, different hash or service: say so, as a patch.
          const restated: StoredContractDiff = {
            bump: "patch",
            changes: [
              chosen.row.externalId !== iface.externalId
                ? { bump: "patch", at: "service", change: "The same contract is now served by another service of this interface." }
                : { bump: "patch", at: "contract", change: "The description was restated without a structural change." },
            ],
          };
          next = { semver: "", diffText: JSON.stringify(restated), diff: { bump: "patch", changes: restated.changes.map((c) => c.change) } };
        } else {
          next = {
            semver: "",
            diffText: textOf(chosen.diff.stored),
            diff: { bump: chosen.diff.bump, changes: chosen.diff.headline, ...(chosen.diff.omitted !== undefined ? { omitted: chosen.diff.omitted } : {}) },
          };
        }
        next.semver = nextSemver(latest.semver, next.diff!.bump ?? "patch");
      }
    }

    try {
      const written = await prisma.$transaction(async (tx) => {
        /*
         * ONE TEXT WRITER OF AN INTERFACE AT A TIME (consolidated review round
         * 4). At READ COMMITTED an UNCHANGED record that read X as current
         * could null the texts a concurrent record had just committed on the
         * newer row Y, leaving the current row without them (and the build's
         * re-render skips an interface whose other row holds texts). The
         * interface's own row, locked first, orders the two: the second sees
         * the first's row as current, and writes no stale texts. NO KEY: it
         * conflicts with itself, not with a snapshot insert's foreign-key check.
         */
        await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "Interface" WHERE "id" = ${iface.id} AND "organizationId" = ${scope.organizationId} FOR NO KEY UPDATE`);
        let result: Extract<RecordOutcome, { status: "RECORDED" | "UNCHANGED" }> | null = outcome;
        if (result === null) {
          const [semverMajor, semverMinor, semverPatch] = semverParts(next!.semver);
          const row = await tx.contractSnapshot.create({
            data: {
              organizationId: scope.organizationId,
              interfaceId: iface.id,
              interfaceVersion: iface.version,
              externalId: iface.externalId,
              entitySet: iface.entitySet,
              source: contract.facts.source,
              odataVersion: contract.facts.odataVersion,
              semver: next!.semver,
              semverMajor,
              semverMinor,
              semverPatch,
              contentHash: hash,
              ir: JSON_TEXT_PLACEHOLDER,
              irVersion: contract.facts.irVersion,
              diff: Prisma.DbNull,
              irBytes: contract.bytes,
              environment,
              connectionId: input.connectionId ?? null,
              createdById: input.createdById ?? null,
            },
            select: SUMMARY_SELECT,
          });
          // The IR and the diff from their text (json-text.ts): PostgreSQL parses them, this thread copies a string.
          await setJsonText(tx, "ContractSnapshot", { id: row.id, organizationId: scope.organizationId }, { ir: textOf(contract.ir), diff: next!.diffText });
          result = { status: "RECORDED", snapshot: summary(row), diff: next!.diff };
        }
        const current = await currentIn(tx, scope, iface);
        /*
         * THE TEXTS GO ONLY ON THE ROW WHOSE IR THEY WERE RENDERED FROM: this
         * record's new row, or — UNCHANGED — the current row the job was
         * handed (heads.currentId), whose stored IR it rendered them from, so
         * what an UNCHANGED record writes is what that row already holds (or
         * held, before its texts were lost or written by another renderer
         * version): never this compile's own order. Two systems listing the
         * same fields in another order no longer flip /schema between them
         * (consolidated review round 1).
         */
        const renderedFrom = result.status === "RECORDED" ? result.snapshot.id : (input.heads.currentId ?? null);
        if (current && current.contentHash === hash && current.id === renderedFrom) {
          await setSchemaTexts(tx, scope, iface.id, current.id, contract.texts);
        }
        await input.alsoWrite?.(tx, result, current);
        return result;
      });
      if (written.status === "RECORDED") await pruneHistory(scope, iface.id);
      return written;
    } catch (err) {
      // Another compile took this version first: read again and decide again.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return { status: "REFUSED", detail: HISTORY_MOVED };
}

/** Put the /schema texts on one row of the interface, and take them off every other. */
async function setSchemaTexts(
  tx: RawExecutor,
  scope: TenantScope,
  interfaceId: string,
  rowId: string,
  texts: Extract<RecordableContract, { ok: true }>["texts"],
): Promise<void> {
  const text = (t: Uint8Array<ArrayBuffer> | null) => (t === null ? null : textOf(t));
  await tx.$executeRaw(Prisma.sql`
    UPDATE "ContractSnapshot" SET "schemasText" = ${textOf(texts.schemas)}, "createBodyText" = ${text(texts.create)}, "updateBodyText" = ${text(texts.update)}
    WHERE "id" = ${rowId} AND "organizationId" = ${scope.organizationId}
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "ContractSnapshot" SET "schemasText" = NULL, "createBodyText" = NULL, "updateBodyText" = NULL
    WHERE "organizationId" = ${scope.organizationId} AND "interfaceId" = ${interfaceId} AND "id" <> ${rowId} AND "schemasText" IS NOT NULL
  `);
}

/** Rows removed in one pass past the bound: a record adds one row, so one pass keeps up. */
const PRUNE_BATCH = 64;

/**
 * Keep the history bounded (see the header): rows older than the newest
 * LIMITS.snapshotHistory go, except each environment's newest. Best effort —
 * a failure here never fails the record, and the next record prunes again.
 */
async function pruneHistory(scope: TenantScope, interfaceId: string): Promise<void> {
  try {
    const older = await prisma.contractSnapshot.findMany({
      where: scopedWhere(scope, { interfaceId }),
      orderBy: [...NEWEST_FIRST],
      skip: LIMITS.snapshotHistory,
      take: PRUNE_BATCH,
      select: { id: true },
    });
    if (older.length === 0) return;
    const keep = new Set((await environmentHeads(scope, interfaceId)).map((h) => h.id));
    const ids = older.map((r) => r.id).filter((id) => !keep.has(id));
    if (ids.length > 0) {
      await prisma.contractSnapshot.deleteMany({ where: { organizationId: scope.organizationId, interfaceId, id: { in: ids } } });
    }
  } catch (err) {
    console.error("[contracts] snapshot history not pruned", { interfaceId, error: err instanceof Error ? err.name : "unknown" });
  }
}

/** Does this snapshot describe the interface as it is configured now? */
export function describesInterfaceNow(
  snap: { externalId: string; entitySet: string },
  iface: { externalId: string; entitySet: string | null },
): boolean {
  return iface.entitySet !== null && snap.externalId === iface.externalId && snap.entitySet === iface.entitySet;
}

/** A current snapshot before its IR is read: what it is, and how large. */
export interface CurrentSnapshotSummary extends SnapshotSummary {
  /** Canonical bytes of its contract; null on a row recorded before they were kept (measured on read). */
  irBytes: number | null;
  /** octet_length of its /schema texts, whatever renderer version wrote them; null when it holds none (NOT_RENDERED). */
  schemasBytes: number | null;
  createBodyBytes: number | null;
  updateBodyBytes: number | null;
}

/**
 * The current snapshot of each interface, by interface id, WITHOUT its IR or
 * texts — so a reader can add up what it would read before reading any of
 * it (doc-inputs.ts). One statement however many interfaces: a DISTINCT ON
 * over the (interfaceId, semver) index, at most one small row each.
 */
export async function currentSnapshotSummaries(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
): Promise<Map<string, CurrentSnapshotSummary>> {
  const out = new Map<string, CurrentSnapshotSummary>();
  const wanted = interfaces.filter((i): i is typeof i & { entitySet: string } => i.entitySet !== null);
  if (wanted.length === 0) return out;

  type Row = Parameters<typeof summary>[0] & {
    interfaceId: string;
    irBytes: number | null;
    schemasBytes: number | null;
    createBodyBytes: number | null;
    updateBodyBytes: number | null;
  };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT DISTINCT ON (s."interfaceId")
      s."interfaceId", s."id", s."semver", s."contentHash", s."source", s."odataVersion", s."entitySet", s."externalId",
      s."interfaceVersion", s."createdAt", s."irBytes",
      octet_length(s."schemasText") AS "schemasBytes", octet_length(s."createBodyText") AS "createBodyBytes",
      octet_length(s."updateBodyText") AS "updateBodyBytes"
    FROM "ContractSnapshot" s
    JOIN unnest(${wanted.map((i) => i.id)}::text[], ${wanted.map((i) => i.externalId)}::text[], ${wanted.map((i) => i.entitySet)}::text[])
      AS w("interfaceId", "externalId", "entitySet")
      ON s."interfaceId" = w."interfaceId" AND s."externalId" = w."externalId" AND s."entitySet" = w."entitySet"
    WHERE s."organizationId" = ${scope.organizationId}
    ORDER BY s."interfaceId", s."semverMajor" DESC, s."semverMinor" DESC, s."semverPatch" DESC
  `);
  const n = (v: number | bigint | null) => (v === null ? null : Number(v));
  for (const hit of rows) {
    // Texts of any renderer version are served (see the header): the version only picks the re-render's rows.
    out.set(hit.interfaceId, {
      ...summary(hit),
      irBytes: n(hit.irBytes),
      schemasBytes: n(hit.schemasBytes),
      createBodyBytes: n(hit.createBodyBytes),
      updateBodyBytes: n(hit.updateBodyBytes),
    });
  }
  return out;
}

/**
 * GET /schema's texts of one snapshot, as stored: its schemas, and the write
 * body `operation` sends (UPDATE's or CREATE's) when `body` is asked for. One
 * statement; null when the row is gone. Texts of any renderer version are
 * served (see the header).
 */
export async function snapshotSchemaTexts(
  scope: TenantScope,
  snapshotId: string,
  body: "CREATE" | "UPDATE" | null,
): Promise<{ schemas: string | null; body: string | null } | null> {
  const rows = await prisma.$queryRaw<{ schemas: string | null; body: string | null }[]>(Prisma.sql`
    SELECT "schemasText" AS "schemas",
      ${body === "UPDATE" ? Prisma.sql`"updateBodyText"` : body === "CREATE" ? Prisma.sql`"createBodyText"` : Prisma.sql`NULL::text`} AS "body"
    FROM "ContractSnapshot"
    WHERE "organizationId" = ${scope.organizationId} AND "id" = ${snapshotId}
  `);
  const row = rows[0];
  return row ? { schemas: row.schemas, body: row.body } : null;
}

/** The chosen snapshots' IRs, read in one query; each with its size, measured when it was not kept. */
export async function snapshotContracts(
  scope: TenantScope,
  chosen: ReadonlyMap<string, CurrentSnapshotSummary>,
): Promise<Map<string, CurrentSnapshot & { irBytes: number }>> {
  const out = new Map<string, CurrentSnapshot & { irBytes: number }>();
  if (chosen.size === 0) return out;
  const irs = await prisma.contractSnapshot.findMany({
    where: scopedWhere(scope, { id: { in: [...chosen.values()].map((c) => c.id) } }),
    select: { id: true, ir: true },
  });
  const irById = new Map(irs.map((r) => [r.id, r.ir]));
  for (const [interfaceId, c] of chosen) {
    const ir = irById.get(c.id);
    if (!ir) continue;
    const contract = ir as unknown as InterfaceContract;
    // A row recorded before its size was kept is measured now, by the budgeted
    // writer, which stops just past the bound: readers refuse anything over it.
    out.set(interfaceId, { ...c, contract, irBytes: c.irBytes ?? jsonBytesUpTo(contract, MAX_CONTRACT_BYTES) });
  }
  return out;
}

/**
 * snapshotContracts for a download that only hands the IRs to its render
 * job: each IR whose size was kept is read AS ITS TEXT (`ir::text`) and
 * carried as a reference to it (render-input.ts) — parsed in the worker,
 * never on the request thread. A row that predates the kept size is read and
 * measured as before.
 */
export async function snapshotContractTexts(
  scope: TenantScope,
  chosen: ReadonlyMap<string, CurrentSnapshotSummary>,
): Promise<Map<string, CurrentSnapshot & { irBytes: number }>> {
  const sized = new Map([...chosen].filter(([, c]) => c.irBytes !== null));
  const out = await snapshotContracts(scope, new Map([...chosen].filter(([, c]) => c.irBytes === null)));
  const ids = [...sized.values()].map((c) => c.id);
  const rows =
    ids.length === 0
      ? []
      : await prisma.$queryRaw<{ id: string; ir: string }[]>(Prisma.sql`
          SELECT "id", "ir"::text AS "ir" FROM "ContractSnapshot"
          WHERE "organizationId" = ${scope.organizationId} AND "id" IN (${Prisma.join(ids)})
        `);
  const texts = new Map(rows.map((r) => [r.id, jsonTextRef<InterfaceContract>(r.ir)]));
  for (const [interfaceId, c] of sized) {
    const contract = texts.get(c.id);
    if (contract) out.set(interfaceId, { ...c, contract, irBytes: c.irBytes! });
  }
  return out;
}

/**
 * The current snapshot of each interface, by interface id; one entry per
 * interface that has one. Two queries whatever the count.
 */
export async function currentContractSnapshots(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
): Promise<Map<string, CurrentSnapshot>> {
  return snapshotContracts(scope, await currentSnapshotSummaries(scope, interfaces));
}

export async function currentContractSnapshot(
  scope: TenantScope,
  iface: { id: string; externalId: string; entitySet: string | null },
): Promise<CurrentSnapshot | null> {
  return (await currentContractSnapshots(scope, [iface])).get(iface.id) ?? null;
}
