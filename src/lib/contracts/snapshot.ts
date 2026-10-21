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
 */

import { Prisma } from "@prisma/client";

import { jsonBytesUpTo } from "@/lib/contracts/budget";
import { MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
import { nextSemver, semverParts, type ContractDiff, type StoredContractDiff } from "@/lib/contracts/diff";
import { runInEnvelope } from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import type { DiffJobOutput, EnvelopeRefusal } from "@/lib/contracts/pipeline";
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

export interface CurrentSnapshot extends SnapshotSummary {
  contract: InterfaceContract;
}

export type RecordOutcome =
  | { status: "RECORDED"; snapshot: SnapshotSummary; diff: StoredContractDiff | null }
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
  previous: InterfaceContract[],
  next: InterfaceContract,
): Promise<{ ok: true; value: DiffJobOutput } | { ok: false; reason: EnvelopeRefusal }> {
  const r = await runInEnvelope({ kind: "diff", input: { previous, next } });
  return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
}

export async function recordContractSnapshot(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string };
  contract: InterfaceContract;
  /**
   * The digest the envelope already took, with the contract rendered and
   * measured for every read path (pipeline.ts, the verify's compile).
   * Absent, the contract is prepared in the envelope here.
   */
  prepared?: { hash: string; bytes: number };
  environment?: string | null;
  connectionId?: string | null;
  createdById?: string | null;
}): Promise<RecordOutcome> {
  const { scope, iface, contract } = input;
  const environment = input.environment ?? null;
  let prepared = input.prepared;
  if (!prepared) {
    // Digested under the contract budget, then rendered under every read
    // path's (budget.ts), in the envelope: refused before anything is stored.
    const r = await runInEnvelope({ kind: "prepare", input: { contract, subject: null } });
    if (!r.ok) return { status: "REFUSED", reason: r.reason, detail: r.detail };
    if (!r.value.ok) {
      return r.value.reason === "TOO_LARGE"
        ? { status: "TOO_LARGE", bytes: r.value.bytes ?? MAX_CONTRACT_BYTES + 1 }
        : { status: "REFUSED", reason: r.value.reason, detail: r.value.detail };
    }
    prepared = { hash: r.value.hash, bytes: r.value.bytes };
  }
  // A digest over the bound is never stored, however it was taken.
  if (prepared.bytes > MAX_CONTRACT_BYTES) return { status: "TOO_LARGE", bytes: prepared.bytes };
  const { hash, bytes } = prepared;

  for (let attempt = 0; attempt < 3; attempt++) {
    // Summaries only: an interface has a handful of versions, and the IRs
    // the diff needs are read below.
    const rows = await prisma.contractSnapshot.findMany({
      where: scopedWhere(scope, { interfaceId: iface.id }),
      orderBy: [...NEWEST_FIRST],
      select: { ...SUMMARY_SELECT, environment: true },
    });
    const latest = rows[0];
    const own = rows.find((r) => r.environment === environment);
    const same = (r: (typeof rows)[number]) => r.contentHash === hash && r.externalId === iface.externalId;
    if (own && same(own)) return { status: "UNCHANGED", snapshot: summary(own) };
    // Newest first, so the first match is the newest; it counts only if it is past this environment's own.
    const match = rows.find(same);
    if (match && (!own || laterThan(match.semver, own.semver))) return { status: "UNCHANGED", snapshot: summary(match) };

    let stored: StoredContractDiff | null = null;
    let semver = "1.0.0";
    if (latest) {
      // What this contract is a change OF: the environment's own newest row;
      // for its first verify, whichever environment's newest row it is
      // nearest to (the smallest bump, the newer on a tie).
      const heads = new Map<string | null, (typeof rows)[number]>();
      for (const r of rows) if (!heads.has(r.environment)) heads.set(r.environment, r);
      const candidates = own ? [own] : [...heads.values()];
      const irs = await prisma.contractSnapshot.findMany({
        where: scopedWhere(scope, { id: { in: [...new Set([...candidates, latest].map((c) => c.id))] } }),
        select: { id: true, ir: true },
      });
      const irById = new Map(irs.map((r) => [r.id, r.ir]));
      const latestIr = irById.get(latest.id);
      const present = candidates.filter((row) => irById.has(row.id));
      if (present.length === 0 || !latestIr) continue; // removed meanwhile: read again
      // Every diff this decision needs, in one envelope job: the candidates', then the line's.
      const onLineToo = !present.some((row) => row.id === latest.id);
      const compared = await diffsInEnvelope(
        [...present, ...(onLineToo ? [latest] : [])].map((row) => irById.get(row.id) as unknown as InterfaceContract),
        contract,
      );
      if (!compared.ok) {
        return {
          status: "REFUSED",
          reason: compared.reason,
          detail:
            compared.reason === "BUSY"
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
      // What is stored is bounded whatever the contract (storedDiff, diff.ts, run in the envelope).
      stored = chosen.diff.stored;
      if (chosen.diff.bump === null) {
        // Same structure, different hash or service: say so, as a patch.
        stored = {
          bump: "patch",
          changes: [
            chosen.row.externalId !== iface.externalId
              ? { bump: "patch", at: "service", change: "The same contract is now served by another service of this interface." }
              : { bump: "patch", at: "contract", change: "The description was restated without a structural change." },
          ],
        };
      }
      semver = nextSemver(latest.semver, stored.bump ?? "patch");
    }
    const [semverMajor, semverMinor, semverPatch] = semverParts(semver);

    try {
      const row = await prisma.contractSnapshot.create({
        data: {
          organizationId: scope.organizationId,
          interfaceId: iface.id,
          interfaceVersion: iface.version,
          externalId: iface.externalId,
          entitySet: iface.entitySet,
          source: contract.source,
          odataVersion: contract.odataVersion,
          semver,
          semverMajor,
          semverMinor,
          semverPatch,
          contentHash: hash,
          ir: contract as unknown as Prisma.InputJsonObject,
          irVersion: contract.irVersion,
          diff: stored === null ? Prisma.DbNull : (stored as unknown as Prisma.InputJsonObject),
          irBytes: bytes,
          environment,
          connectionId: input.connectionId ?? null,
          createdById: input.createdById ?? null,
        },
        select: SUMMARY_SELECT,
      });
      return { status: "RECORDED", snapshot: summary(row), diff: stored };
    } catch (err) {
      // Another compile took this version first: read again and decide again.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not record the contract snapshot: the interface's version kept moving.");
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
 * (doc-inputs.ts). One query whatever the count.
 */
export async function currentSnapshotSummaries(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
): Promise<Map<string, CurrentSnapshotSummary>> {
  const out = new Map<string, CurrentSnapshotSummary>();
  const wanted = interfaces.filter((i) => i.entitySet !== null);
  if (wanted.length === 0) return out;

  const candidates = await prisma.contractSnapshot.findMany({
    where: scopedWhere(scope, { interfaceId: { in: wanted.map((i) => i.id) } }),
    orderBy: [{ interfaceId: "asc" }, ...NEWEST_FIRST],
    select: { ...SUMMARY_SELECT, interfaceId: true, irBytes: true },
  });
  // Grouped once: a scan of every candidate per interface was I×C.
  const byInterface = new Map<string, (typeof candidates)[number][]>();
  for (const c of candidates) {
    const list = byInterface.get(c.interfaceId);
    if (list) list.push(c);
    else byInterface.set(c.interfaceId, [c]);
  }
  for (const iface of wanted) {
    const hit = byInterface.get(iface.id)?.find((c) => describesInterfaceNow(c, iface));
    if (hit) out.set(iface.id, { ...summary(hit), irBytes: typeof hit.irBytes === "number" ? hit.irBytes : null });
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
