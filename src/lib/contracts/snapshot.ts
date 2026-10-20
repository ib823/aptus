/**
 * ContractSnapshot persistence: record a compiled contract, and find the one
 * that describes an interface now (P1.3).
 *
 * ONE ROW PER CONTRACT, NOT PER COMPILE. Verifying the same service twice
 * compiles twice and records once: a row is written only when the content
 * hash (or the service it describes) differs from the interface's latest.
 * The new row's version is the latest's, bumped by the structural diff
 * (diff.ts) — the first is 1.0.0. Rows are immutable; nothing here updates
 * one.
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

import { contractHash } from "@/lib/contracts/canonical";
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
  | { status: "UNCHANGED"; snapshot: SnapshotSummary };

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

export async function recordContractSnapshot(input: {
  scope: TenantScope;
  iface: { id: string; version: number; externalId: string; entitySet: string };
  contract: InterfaceContract;
  environment?: string | null;
  connectionId?: string | null;
  createdById?: string | null;
}): Promise<RecordOutcome> {
  const { scope, iface, contract } = input;
  const hash = contractHash(contract);

  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await prisma.contractSnapshot.findFirst({
      where: scopedWhere(scope, { interfaceId: iface.id }),
      orderBy: [...NEWEST_FIRST],
      select: { ...SUMMARY_SELECT, ir: true },
    });
    if (latest && latest.contentHash === hash && latest.externalId === iface.externalId) {
      return { status: "UNCHANGED", snapshot: summary(latest) };
    }

    let diff: ContractDiff | null = null;
    let semver = "1.0.0";
    if (latest) {
      diff = diffContracts(latest.ir as unknown as InterfaceContract, contract);
      if (diff.bump === null) {
        // Same structure, different hash or service: say so, as a patch.
        diff = {
          bump: "patch",
          changes: [
            latest.externalId !== iface.externalId
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
          environment: input.environment ?? null,
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
