#!/usr/bin/env tsx
/**
 * 2608 WS7 — refuse to deploy a release whose content is not in the database.
 *
 * WHY THIS EXISTS. WS7 made 2608 the default content release. The scoping
 * extension (src/lib/db/content-release-scope.ts) then narrows every
 * catalogue read to that release — and a release with no rows scopes to
 * NOTHING. It does not fall back to 2602. The failure is silent and total:
 * an empty scope picker, an empty config matrix, reports with no steps, a
 * To-Be pack that draws nothing, all with a 200 and no error in the log.
 *
 * At the time this was written, production held 853 ScopeItem / 4,210
 * ConfigActivity / 129,481 ProcessStep rows, every one of them release-NULL
 * (= 2602), and zero SapContentRelease rows: the WS1/WS2/WS5 loaders had
 * only ever run against a local database. Shipping the flip on top of that
 * would have emptied the product. So the flip ships with the thing that
 * stops it.
 *
 * WHAT IT REFUSES. Only a real misconfiguration: the selected release has no
 * rows AND some other release does. A genuinely empty database — a fresh
 * environment, a preview branch, CI before the seed — passes, because there
 * is nothing there to lose and nothing to compare against.
 *
 * Runs in `vercel-build` after `prisma generate`, so a bad flag fails the
 * deploy rather than reaching a user. Exits 0 when the DB is unreachable:
 * this guard's job is to catch a wrong release, not to become a second,
 * flakier database health check in front of every build.
 */
import { PrismaClient } from "@prisma/client";

import { releaseWhere, type RELEASE_SCOPED_MODELS } from "@/lib/db/content-release-scope";
import { SAP_CONTENT_RELEASES, resolveSapContentRelease, type SapContentReleaseCode } from "@/lib/sap-content/release";

type Counts = Record<string, number>;

/** Prisma messages open with a blank line; take the first line that says something. */
const firstLine = (e: Error): string => e.message.split("\n").map((l) => l.trim()).find(Boolean) ?? e.name;

const total = (c: Counts): number => Object.values(c).reduce((n, v) => n + v, 0);
const fmt = (c: Counts): string =>
  Object.entries(c)
    .map(([k, v]) => `${k} ${v.toLocaleString("en-GB")}`)
    .join(" · ");

/** Rows visible to `release` in each release-scoped model. */
async function countByRelease(prisma: PrismaClient, release: SapContentReleaseCode): Promise<Counts> {
  /*
   * `where` is passed explicitly, so the scoping extension leaves these alone
   * even if this script ever runs through the extended client. Each delegate
   * is named rather than looked up: Prisma types each `count` against its own
   * model, and a generic lookup only typechecks by widening `where` to
   * `unknown`, which throws away the very thing being asserted.
   */
  const where = releaseWhere(release) as never;
  return {
    ScopeItem: await prisma.scopeItem.count({ where }),
    ProcessStep: await prisma.processStep.count({ where }),
    ConfigActivity: await prisma.configActivity.count({ where }),
  } satisfies Record<(typeof RELEASE_SCOPED_MODELS)[number], number>;
}

export type LandingVerdict =
  | { kind: "landed" }
  | { kind: "unseeded" }
  | { kind: "not-landed"; populated: { release: SapContentReleaseCode; counts: Counts }[] };

/**
 * The whole decision, separated from the database so it can be tested.
 * Empty-everywhere is an unseeded environment, not a misconfiguration —
 * refusing there would break every fresh deploy to protect nothing.
 */
export function classifyReleaseLanding(
  selected: Counts,
  others: { release: SapContentReleaseCode; counts: Counts }[],
): LandingVerdict {
  if (total(selected) > 0) return { kind: "landed" };
  const populated = others.filter((o) => total(o.counts) > 0);
  return populated.length === 0 ? { kind: "unseeded" } : { kind: "not-landed", populated };
}

async function main(): Promise<void> {
  const active = resolveSapContentRelease();
  const source = active.fromEnv ? "SAP_CONTENT_RELEASE" : "the built-in default";
  const prisma = new PrismaClient();

  let selected: Counts;
  try {
    selected = await countByRelease(prisma, active.release);
  } catch (err) {
    await prisma.$disconnect();
    /*
     * Only a connection failure is excused. Anything else — a missing table,
     * a schema that does not match — is a real problem this build should not
     * paper over, and swallowing it would turn the guard into a no-op that
     * still reports success.
     */
    if ((err as Error).constructor?.name !== "PrismaClientInitializationError") throw err;
    console.warn(`assert-content-release-landed: skipped — ${firstLine(err as Error)}`);
    return;
  }

  const others: { release: SapContentReleaseCode; counts: Counts }[] = [];
  if (total(selected) === 0) {
    for (const r of SAP_CONTENT_RELEASES) {
      if (r === active.release) continue;
      others.push({ release: r, counts: await countByRelease(prisma, r) });
    }
  }
  await prisma.$disconnect();

  const verdict = classifyReleaseLanding(selected, others);
  if (verdict.kind === "landed") {
    console.log(`SAP content release ${active.release} (from ${source}) is landed: ${fmt(selected)}`);
    return;
  }
  if (verdict.kind === "unseeded") {
    console.warn(
      "assert-content-release-landed: no SAP catalogue content for any release — treating as an unseeded database, not a misconfiguration.",
    );
    return;
  }
  const { populated } = verdict;

  const lines = [
    "",
    "  SAP CONTENT RELEASE NOT LANDED — refusing to build.",
    "",
    `  Active release : ${active.release} (from ${source})`,
    `  Rows visible   : ${fmt(selected)}  ← nothing`,
    ...populated.map((o) => `  Also in the DB : release ${o.release} — ${fmt(o.counts)}`),
    "",
    "  Every catalogue read is scoped to the active release and does NOT fall",
    "  back. Deploying this would serve an empty scope picker, an empty config",
    `  matrix and reports with no process steps.`,
    "",
    "  Fix it one of two ways:",
    "",
    `  1. Land the content, then re-deploy:`,
    `       pnpm sap:2608:seed-release`,
    `       pnpm sap:2608:load-scope`,
    `       pnpm sap:2608:load-sscui`,
    `       pnpm sap:2608:load-process-steps`,
    `       pnpm sap:2608:load-bdc`,
    `       pnpm sap:2608:recon --db     # must be green before you deploy`,
    "",
    `  2. Or stay on a landed release for now:`,
    `       set SAP_CONTENT_RELEASE=${populated[0]!.release} in the deployment environment`,
    "",
  ];
  console.error(lines.join("\n"));
  process.exit(1);
}

main().catch((err) => {
  console.error(`assert-content-release-landed: ${(err as Error).message}`);
  process.exit(1);
});
