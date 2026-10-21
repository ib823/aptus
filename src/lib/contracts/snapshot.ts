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
 * would be read back on every /schema call.
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

import { contractDigest, MAX_CONTRACT_BYTES } from "@/lib/contracts/canonical";
import { diffContracts, nextSemver, semverParts, type ContractDiff } from "@/lib/contracts/diff";
import type { InterfaceContract } from "@/lib/contracts/ir";
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
  | { status: "RECORDED"; snapshot: SnapshotSummary; diff: ContractDiff | null }
  | { status: "UNCHANGED"; snapshot: SnapshotSummary }
  | { status: "TOO_LARGE"; bytes: number };

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

export async function recordContractSnapshot(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string };
  contract: InterfaceContract;
  environment?: string | null;
  connectionId?: string | null;
  createdById?: string | null;
}): Promise<RecordOutcome> {
  const { scope, iface, contract } = input;
  const environment = input.environment ?? null;
  const { hash, bytes } = contractDigest(contract);
  if (bytes > MAX_CONTRACT_BYTES) return { status: "TOO_LARGE", bytes };

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

    let diff: ContractDiff | null = null;
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
      let best: { row: (typeof rows)[number]; diff: ContractDiff } | null = null;
      for (const row of candidates) {
        const ir = irById.get(row.id);
        if (!ir) continue;
        const d = diffContracts(ir as unknown as InterfaceContract, contract);
        if (!best || bumpRank(d.bump) < bumpRank(best.diff.bump)) best = { row, diff: d };
      }
      const latestIr = irById.get(latest.id);
      if (!best || !latestIr) continue; // removed meanwhile: read again
      // And against the row it follows on the line (see the header): never a
      // smaller bump than what the line itself changed.
      if (best.row.id !== latest.id) {
        const onLine = diffContracts(latestIr as unknown as InterfaceContract, contract);
        if (bumpRank(onLine.bump) > bumpRank(best.diff.bump)) best = { row: latest, diff: onLine };
      }
      diff = best.diff;
      if (diff.bump === null) {
        // Same structure, different hash or service: say so, as a patch.
        diff = {
          bump: "patch",
          changes: [
            best.row.externalId !== iface.externalId
              ? { bump: "patch", at: "service", change: "The same contract is now served by another service of this interface." }
              : { bump: "patch", at: "contract", change: "The description was restated without a structural change." },
          ],
        };
      }
      semver = nextSemver(latest.semver, diff.bump ?? "patch");
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
          diff: diff === null ? Prisma.DbNull : (diff as unknown as Prisma.InputJsonObject),
          environment,
          connectionId: input.connectionId ?? null,
          createdById: input.createdById ?? null,
        },
        select: SUMMARY_SELECT,
      });
      return { status: "RECORDED", snapshot: summary(row), diff };
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

/**
 * The current snapshot of each interface, by interface id; one entry per
 * interface that has one. Two queries whatever the count: the candidates
 * without their IR, then the chosen rows' IR.
 */
export async function currentContractSnapshots(
  scope: TenantScope,
  interfaces: readonly { id: string; externalId: string; entitySet: string | null }[],
): Promise<Map<string, CurrentSnapshot>> {
  const out = new Map<string, CurrentSnapshot>();
  const wanted = interfaces.filter((i) => i.entitySet !== null);
  if (wanted.length === 0) return out;

  const candidates = await prisma.contractSnapshot.findMany({
    where: scopedWhere(scope, { interfaceId: { in: wanted.map((i) => i.id) } }),
    orderBy: [{ interfaceId: "asc" }, ...NEWEST_FIRST],
    select: { ...SUMMARY_SELECT, interfaceId: true },
  });
  const chosen = new Map<string, (typeof candidates)[number]>();
  for (const iface of wanted) {
    const hit = candidates.find((c) => c.interfaceId === iface.id && describesInterfaceNow(c, iface));
    if (hit) chosen.set(iface.id, hit);
  }
  if (chosen.size === 0) return out;

  const irs = await prisma.contractSnapshot.findMany({
    where: scopedWhere(scope, { id: { in: [...chosen.values()].map((c) => c.id) } }),
    select: { id: true, ir: true },
  });
  const irById = new Map(irs.map((r) => [r.id, r.ir]));
  for (const [interfaceId, c] of chosen) {
    const ir = irById.get(c.id);
    if (!ir) continue;
    out.set(interfaceId, { ...summary(c), contract: ir as unknown as InterfaceContract });
  }
  return out;
}

export async function currentContractSnapshot(
  scope: TenantScope,
  iface: { id: string; externalId: string; entitySet: string | null },
): Promise<CurrentSnapshot | null> {
  return (await currentContractSnapshots(scope, [iface])).get(iface.id) ?? null;
}
