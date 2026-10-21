/**
 * ContractSnapshot persistence: record a compiled contract, and find the one
 * that describes an interface now (P1.3).
 *
 * ONE ROW PER CONTRACT, NOT PER COMPILE. Verifying the same service twice
 * compiles twice and records once. Rows are immutable; nothing here updates
 * one.
 *
 * ENVIRONMENTS ARE NOT IN STEP. DEV runs ahead of PROD by transports, so the
 * same interface verified in each describes two contracts at once, and
 * connections that log on in different languages describe the same structure
 * with different labels. Compared only with the interface's latest row, every
 * verify that alternated environments was a new version — and every return to
 * PROD a field "removed", a major one. So each environment is followed along
 * its own rows (the rows its verifies wrote; SAMPLED rows have none and are a
 * line of their own):
 *
 *   - the compile matches the environment's own newest row: UNCHANGED, that row;
 *   - it matches a row NEWER than that (or the environment has none): the
 *     environment is catching up to a contract another one already recorded —
 *     UNCHANGED, that row;
 *   - otherwise a new row. Its diff is against the environment's own newest
 *     row — for an environment's first verify, against whichever
 *     environment's newest row it is nearest to — and its version is the
 *     interface's latest bumped by that diff, so versions stay one ordered
 *     line. An environment going BACK to an older contract of its
 *     own is a new version — a field that disappeared is still a change.
 *   - THE LINE DECIDES THE BUMP TOO. The new row follows the interface's
 *     latest on the line, and the line is what /schema, the OpenAPI and the
 *     kit serve as current. So the bump is the larger of the two: against
 *     the environment's own row, and against the latest. Diffed only against
 *     its own row, an environment whose own row was older than the latest
 *     (it had caught up to the latest without writing a row) recorded "one
 *     field added", a minor, for a contract that had also lost a field the
 *     latest had — and a consumer pinned to ^1.1 lost it in 1.2.0 (P1 wave
 *     A review). The recorded diff is the one that decided the bump.
 *
 * A contract larger than MAX_CONTRACT_BYTES is never stored (TOO_LARGE): it
 * would be read back on every /schema call. Nor is one whose /schema, kit or
 * solution document would not fit its read path's budget (REFUSED,
 * OUTPUT_TOO_LARGE): every contract is digested, rendered and measured in the
 * envelope before it gets here (pipeline.ts), and its diffs run there too.
 *
 * WHICH ONE IS CURRENT. The newest snapshot whose service (externalId) and
 * dataset match the interface now. A version bump for another reason — the
 * operation changed, say — does not make the description of the dataset
 * wrong; pointing the interface at another dataset or service does, and then
 * no snapshot is current until that one is verified.
 *
 * TWO VERIFIES AT ONCE. Both may compute the same next version; the unique
 * key (interfaceId, major, minor, patch) lets one win, and the other re-reads
 * the latest and either finds its own contract there (unchanged) or bumps
 * past it.
 *
 * WHAT A DECISION READS IS WHAT IT NEEDS, AND THE HISTORY IS BOUNDED
 * (structural hardening round 1). A description that flips between two
 * contracts records a version per verify, by design; every read used to load
 * every one of an interface's rows and pick in JS, so each /schema, kit and
 * document read grew with however many flips an attacker had made (20,030
 * rows: half a second a call). Now each decision asks the database for the
 * one row it needs — the newest row, the newest of an environment, the
 * newest with a hash, the newest describing the interface now — each an
 * indexed lookup of one row, whatever the history. And the history itself is
 * bounded: when a row is recorded, rows older than the newest
 * LIMITS.snapshotHistory are removed, except each environment's newest
 * (which a later verify of that environment is compared with). No reader
 * reads older rows; versions stay one ordered line, because the newest rows
 * are never removed.
 */

import { Prisma } from "@prisma/client";

import { jsonBytesUpTo, LIMITS } from "@/lib/contracts/budget";
import { MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
import { nextSemver, semverParts, type Bump, type ContractDiff, type StoredContractDiff } from "@/lib/contracts/diff";
import { ALLOWANCE_CAUSE, runInEnvelope } from "@/lib/contracts/envelope";
import { contractBodies } from "@/lib/contracts/json-schema";
import { isJsonTextRef, jsonTextOf, jsonTextRef } from "@/lib/contracts/render-input";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { contractFacts, type ContractFacts, type DiffJobOutput, type EnvelopeRefusal } from "@/lib/contracts/pipeline";
import { JSON_TEXT_PLACEHOLDER, writeWithJsonText } from "@/lib/db/json-text";
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

/**
 * What a recorded version's diff says to the verify: its bump and its first
 * changes (DIFF_HEADLINE_CHANGES), as sentences. The diff itself is stored
 * as the envelope wrote it, never read back here.
 */
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
  | { status: "TOO_LARGE"; bytes: number }
  /** The envelope refused the work (its limits), or a read path's output would not fit its budget: nothing stored. */
  | { status: "REFUSED"; reason: EnvelopeRefusal | "OUTPUT_TOO_LARGE" | "NO_SUCH_ENTITY_SET" | "NO_SUCH_ENTITY_TYPE"; detail: string };

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

const bumpRank = (b: ContractDiff["bump"]): number => (b === null ? 0 : b === "patch" ? 1 : b === "minor" ? 2 : 3);

/** Is version a later than version b? */
function laterThan(a: string, b: string): boolean {
  const [x, y] = [semverParts(a), semverParts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

/**
 * The diffs of `next` against each of `previous`, IN THE ENVELOPE
 * (envelope.ts): a diff is linear today, and if a contract is ever found
 * that makes it otherwise, it ends its own worker, not this thread. When the
 * envelope refuses, the record is refused too: a version cannot be chosen
 * without its diff.
 */
async function diffsInEnvelope(
  scope: TenantScope,
  previous: InterfaceContract[],
  next: InterfaceContract,
  deadlineAt: number | null,
): Promise<{ ok: true; value: DiffJobOutput } | { ok: false; reason: EnvelopeRefusal; detail: string; cause?: string }> {
  /*
   * Under the organisation's share of the envelope (envelope.ts), and inside
   * the caller's own deadline. ADMITTED (structural hardening round 6): a
   * record diffs only a contract its verify's compile (or this record's
   * prepare) was admitted for and ran, so the diff is charged to the
   * allowance and never refused by it — a compile that was paid for is not
   * then thrown away at its diff, nor reported as "too many at once".
   */
  const r = await runInEnvelope({ kind: "diff", input: { previous, next } }, undefined, {
    tenant: scope.organizationId,
    deadlineAt,
    admitted: true,
  });
  return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason, detail: r.detail, ...(r.cause ? { cause: r.cause } : {}) };
}

/**
 * The IRs of these rows AS THEIR STORED TEXT (structural hardening round 4):
 * a diff only hands them to its worker, so they are never parsed, walked or
 * structured-cloned on this thread — read as `ir::text`, carried as
 * references to it (render-input.ts) and parsed in the worker. By id.
 */
async function snapshotIrTexts(scope: TenantScope, ids: readonly string[]): Promise<Map<string, InterfaceContract>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; ir: string }[]>(Prisma.sql`
    SELECT "id", "ir"::text AS "ir"
    FROM "ContractSnapshot"
    WHERE "organizationId" = ${scope.organizationId} AND "id" IN (${Prisma.join([...ids])})
  `);
  return new Map(rows.map((r) => [r.id, jsonTextRef<InterfaceContract>(r.ir)]));
}

export async function recordContractSnapshot(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string };
  /** The contract: from the envelope, a reference to its JSON text (pipeline.ts, replyOf), stored as it is. */
  contract: InterfaceContract;
  /**
   * The digest the envelope already took, with the contract rendered and
   * measured for every read path (pipeline.ts, the verify's compile), and
   * what it states of itself (facts). Absent, the contract is prepared in
   * the envelope here.
   */
  prepared?: { hash: string; bytes: number; facts?: ContractFacts };
  environment?: string | null;
  connectionId?: string | null;
  createdById?: string | null;
  /** When the caller must have its answer (ms since the epoch): the envelope's jobs end by then (envelope.ts). */
  deadlineAt?: number | null;
}): Promise<RecordOutcome> {
  const { scope, iface } = input;
  let contract = input.contract;
  const environment = input.environment ?? null;
  let prepared = input.prepared;
  if (!prepared) {
    // Digested under the contract budget, then rendered under every read
    // path's (budget.ts), in the envelope: refused before anything is stored.
    const r = await runInEnvelope(
      { kind: "prepare", input: { contract, subject: null } },
      undefined,
      { tenant: scope.organizationId, deadlineAt: input.deadlineAt ?? null },
    );
    if (!r.ok) return { status: "REFUSED", reason: r.reason, detail: r.detail };
    if (!r.value.ok) {
      return r.value.reason === "TOO_LARGE"
        ? { status: "TOO_LARGE", bytes: r.value.bytes ?? MAX_CONTRACT_BYTES + 1 }
        : { status: "REFUSED", reason: r.value.reason, detail: r.value.detail };
    }
    prepared = { hash: r.value.hash, bytes: r.value.bytes, facts: r.value.facts };
    // As its text, as the envelope handed it back: stored as it is.
    contract = r.value.contract;
  }
  // A digest over the bound is never stored, however it was taken.
  if (prepared.bytes > MAX_CONTRACT_BYTES) return { status: "TOO_LARGE", bytes: prepared.bytes };
  const { hash, bytes } = prepared;
  /*
   * TEXT, NOT AN OBJECT GRAPH (structural hardening round 5): the contract
   * is written to its row, and handed to the diff, as its JSON text — the
   * worker's, when it came from the envelope — never serialised node by node
   * on this thread (json-text.ts). What the row states beside it comes from
   * the facts the envelope took.
   */
  const irText = isJsonTextRef(contract) ? jsonTextOf(contract) : JSON.stringify(contract);
  const facts = prepared.facts ?? contractFacts(isJsonTextRef(contract) ? (JSON.parse(irText) as InterfaceContract) : contract);

  for (let attempt = 0; attempt < 3; attempt++) {
    // Summaries only, and only the rows the decision needs: each one indexed
    // lookup, however long the history (see the header). The IRs the diff
    // needs are read below.
    const newest = (where: Prisma.ContractSnapshotWhereInput) =>
      prisma.contractSnapshot.findFirst({
        where: scopedWhere(scope, { interfaceId: iface.id, ...where }),
        orderBy: [...NEWEST_FIRST],
        select: { ...SUMMARY_SELECT, environment: true },
      });
    const [latest, own, match] = await Promise.all([
      newest({}),
      newest({ environment }),
      // The newest row of this very contract, from this service.
      newest({ contentHash: hash, externalId: iface.externalId }),
    ]);
    if (own && own.contentHash === hash && own.externalId === iface.externalId) return { status: "UNCHANGED", snapshot: summary(own) };
    // It counts only if it is past this environment's own.
    if (match && (!own || laterThan(match.semver, own.semver))) return { status: "UNCHANGED", snapshot: summary(match) };

    /** The diff the row stores, as its text; what the verify reports of it. */
    let storedText: string | null = null;
    let recorded: RecordedDiff | null = null;
    let semver = "1.0.0";
    if (latest) {
      // What this contract is a change OF: the environment's own newest row;
      // for its first verify, whichever environment's newest row it is
      // nearest to (the smallest bump, the newer on a tie).
      const candidates = own ? [own] : await environmentHeads(scope, iface.id);
      // As their text: handed to the diff's worker, never parsed here (snapshotIrTexts).
      const irById = await snapshotIrTexts(scope, [...new Set([...candidates, latest].map((c) => c.id))]);
      const latestIr = irById.get(latest.id);
      const present = candidates.filter((row) => irById.has(row.id));
      if (present.length === 0 || !latestIr) continue; // removed meanwhile: read again
      // Every diff this decision needs, in one envelope job: the candidates', then the line's.
      const onLineToo = !present.some((row) => row.id === latest.id);
      const compared = await diffsInEnvelope(
        scope,
        [...present, ...(onLineToo ? [latest] : [])].map((row) => irById.get(row.id)!),
        // The new contract as its text too: one copy of a string into the worker.
        jsonTextRef<InterfaceContract>(irText),
        input.deadlineAt ?? null,
      );
      if (!compared.ok) {
        return {
          status: "REFUSED",
          reason: compared.reason,
          detail:
            // A spent allowance says whose time and when, in the envelope's words, never "in a moment".
            compared.cause === ALLOWANCE_CAUSE
              ? compared.detail
              : compared.reason === "BUSY"
                ? "Too many contracts are being compiled at once, so this one was not compared with its previous version. Verify again in a moment."
                : "The contract could not be compared with its previous version within the compiler's limits, so it was not recorded.",
        };
      }
      const diffs = compared.value;
      // The smallest bump, the newer on a tie (candidates are newest first).
      let chosen = { row: present[0]!, diff: diffs[0]! };
      for (let i = 1; i < present.length; i++) {
        if (bumpRank(diffs[i]!.bump) < bumpRank(chosen.diff.bump)) chosen = { row: present[i]!, diff: diffs[i]! };
      }
      // And against the row it follows on the line (see the header): never a
      // smaller bump than what the line itself changed — whether the latest
      // row was among the candidates or diffed for this alone.
      if (chosen.row.id !== latest.id) {
        const onLine = onLineToo ? diffs[present.length]! : diffs[present.findIndex((row) => row.id === latest.id)]!;
        if (bumpRank(onLine.bump) > bumpRank(chosen.diff.bump)) chosen = { row: latest, diff: onLine };
      }
      // What is stored is bounded whatever the contract (storedDiff, diff.ts, run in the envelope), and crosses as its text.
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
        storedText = JSON.stringify(restated);
        recorded = { bump: "patch", changes: restated.changes.map((c) => c.change) };
      } else {
        storedText = isJsonTextRef(chosen.diff.stored) ? jsonTextOf(chosen.diff.stored) : JSON.stringify(chosen.diff.stored);
        recorded = {
          bump: chosen.diff.bump,
          changes: chosen.diff.headline,
          ...(chosen.diff.omitted !== undefined ? { omitted: chosen.diff.omitted } : {}),
        };
      }
      semver = nextSemver(latest.semver, recorded.bump ?? "patch");
    }
    const [semverMajor, semverMinor, semverPatch] = semverParts(semver);

    try {
      // The IR and the diff written from their text, in the row's own transaction (json-text.ts).
      const row = await writeWithJsonText("ContractSnapshot", scope.organizationId, { ir: irText, diff: storedText }, (tx) =>
        tx.contractSnapshot.create({
          data: {
            organizationId: scope.organizationId,
            interfaceId: iface.id,
            interfaceVersion: iface.version,
            externalId: iface.externalId,
            entitySet: iface.entitySet,
            source: facts.source,
            odataVersion: facts.odataVersion,
            semver,
            semverMajor,
            semverMinor,
            semverPatch,
            contentHash: hash,
            ir: JSON_TEXT_PLACEHOLDER,
            irVersion: facts.irVersion,
            diff: Prisma.DbNull,
            irBytes: bytes,
            environment,
            connectionId: input.connectionId ?? null,
            createdById: input.createdById ?? null,
          },
          select: SUMMARY_SELECT,
        }),
      );
      await pruneHistory(scope, iface.id);
      return { status: "RECORDED", snapshot: summary(row), diff: recorded };
    } catch (err) {
      // Another compile took this version first: read again and decide again.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not record the contract snapshot: the interface's version kept moving.");
}

type HeadRow = SnapshotSummary & { environment: string | null };

/** Each environment's newest row of the interface, newest first: one indexed lookup per environment. */
async function environmentHeads(scope: TenantScope, interfaceId: string): Promise<HeadRow[]> {
  const heads = await Promise.all(
    SNAPSHOT_ENVIRONMENTS.map((environment) =>
      prisma.contractSnapshot.findFirst({
        where: scopedWhere(scope, { interfaceId, environment }),
        orderBy: [...NEWEST_FIRST],
        select: { ...SUMMARY_SELECT, environment: true },
      }),
    ),
  );
  return heads
    .filter((h): h is NonNullable<typeof h> => h !== null)
    .map((h) => ({ ...summary(h), environment: h.environment }))
    .sort((a, b) => (laterThan(a.semver, b.semver) ? -1 : laterThan(b.semver, a.semver) ? 1 : 0));
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
}

/**
 * The current snapshot of each interface, by interface id, WITHOUT its IR —
 * so a reader can add up what it would render before reading any of it
 * (doc-inputs.ts).
 *
 * ONE STATEMENT, HOWEVER MANY INTERFACES (structural hardening round 5).
 * Round 1 asked for each interface's row with its own indexed lookup, all at
 * once: a solution document of 1,016 interfaces sent 1,016 queries, blocked
 * the request thread for 230-610 ms handling them, and held every pooled
 * connection while other tenants' queries waited (P2024 under a few
 * concurrent downloads). Now the database picks every interface's newest
 * row describing it now (describesInterfaceNow) in one DISTINCT ON over the
 * (interfaceId, semver) index, and answers at most one small row per
 * interface: a read is a constant number of queries, whatever the count.
 */
export async function currentSnapshotSummaries(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
): Promise<Map<string, CurrentSnapshotSummary>> {
  const out = new Map<string, CurrentSnapshotSummary>();
  const wanted = interfaces.filter((i): i is typeof i & { entitySet: string } => i.entitySet !== null);
  if (wanted.length === 0) return out;

  const rows = await prisma.$queryRaw<(Parameters<typeof summary>[0] & { interfaceId: string; irBytes: number | null })[]>(Prisma.sql`
    SELECT DISTINCT ON (s."interfaceId")
      s."interfaceId", s."id", s."semver", s."contentHash", s."source", s."odataVersion", s."entitySet", s."externalId",
      s."interfaceVersion", s."createdAt", s."irBytes"
    FROM "ContractSnapshot" s
    JOIN unnest(${wanted.map((i) => i.id)}::text[], ${wanted.map((i) => i.externalId)}::text[], ${wanted.map((i) => i.entitySet)}::text[])
      AS w("interfaceId", "externalId", "entitySet")
      ON s."interfaceId" = w."interfaceId" AND s."externalId" = w."externalId" AND s."entitySet" = w."entitySet"
    WHERE s."organizationId" = ${scope.organizationId}
    ORDER BY s."interfaceId", s."semverMajor" DESC, s."semverMinor" DESC, s."semverPatch" DESC
  `);
  for (const hit of rows) {
    out.set(hit.interfaceId, { ...summary(hit), irBytes: typeof hit.irBytes === "number" ? hit.irBytes : null });
  }
  return out;
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
 * Whether a snapshot's contract has a create and an update body
 * (contractBodies), read with JSON operators in the database — the two
 * capabilities and the singleton flag it is decided by — never by reading
 * its IR onto this thread (structural hardening round 5: a 2 MiB IR read
 * through Prisma blocked it for 60-80 ms, to answer two booleans). Null
 * when the row is gone.
 */
export async function snapshotBodies(scope: TenantScope, snapshotId: string): Promise<{ create: boolean; update: boolean } | null> {
  const rows = await prisma.$queryRaw<{ source: string; creatable: string | null; updatable: string | null; singleton: string | null }[]>(Prisma.sql`
    SELECT "source",
      "ir"->'entitySet'->'capabilities'->>'creatable' AS "creatable",
      "ir"->'entitySet'->'capabilities'->>'updatable' AS "updatable",
      "ir"->'entitySet'->>'singleton' AS "singleton"
    FROM "ContractSnapshot"
    WHERE "organizationId" = ${scope.organizationId} AND "id" = ${snapshotId}
  `);
  const row = rows[0];
  if (!row) return null;
  const flag = (v: string | null) => (v === "true" ? true : v === "false" ? false : undefined);
  return contractBodies({
    source: row.source === "SAMPLED" ? "SAMPLED" : "METADATA",
    entitySet: { capabilities: { creatable: flag(row.creatable), updatable: flag(row.updatable) }, singleton: flag(row.singleton) },
  } as unknown as InterfaceContract);
}

/**
 * snapshotContracts for a read path that only hands the IRs to a render
 * (structural hardening round 4): each IR whose size was kept is read AS ITS
 * TEXT (`ir::text`) and carried as a reference to it (render-input.ts) — never
 * parsed, walked or structured-cloned on the request thread; the render parses
 * it, in the envelope or inside the request thread's own render clock. A row
 * that predates the kept size is read and measured as before.
 */
export async function snapshotContractTexts(
  scope: TenantScope,
  chosen: ReadonlyMap<string, CurrentSnapshotSummary>,
): Promise<Map<string, CurrentSnapshot & { irBytes: number }>> {
  const sized = new Map([...chosen].filter(([, c]) => c.irBytes !== null));
  const out = await snapshotContracts(scope, new Map([...chosen].filter(([, c]) => c.irBytes === null)));
  const texts = await snapshotIrTexts(scope, [...sized.values()].map((c) => c.id));
  for (const [interfaceId, c] of sized) {
    const contract = texts.get(c.id);
    if (contract) out.set(interfaceId, { ...c, contract, irBytes: c.irBytes! });
  }
  return out;
}

/**
 * The current snapshot of each interface, by interface id; one entry per
 * interface that has one. Two queries whatever the count: the candidates
 * without their IR, then the chosen rows' IR.
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
