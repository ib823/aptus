#!/usr/bin/env tsx
/**
 * Re-render every interface's GET /schema texts at the running
 * SCHEMA_TEXTS_VERSION, from the stored rows (P1.3, consolidated review
 * rounds 2 and 3; src/lib/contracts/rerender.ts says which rows and how).
 *
 * WHEN IT RUNS. In `vercel-build`, after the migrations and `prisma
 * generate`, so a deploy that bumps SCHEMA_TEXTS_VERSION re-renders the texts
 * without a re-verify against each SAP system. It is safe while the previous
 * deployment still serves: /schema serves stored texts whatever version wrote
 * them, so the old deployment serves the new render early, the new one serves
 * the old render for a row not reached yet, and neither answers NOT_RENDERED
 * because of a version. It only ever moves a row to a NEWER version, so an
 * Instant Rollback needs nothing run. By hand (a checkout, the production
 * DATABASE_URL): `pnpm exec tsx scripts/rerender-schema-texts.ts`. With
 * nothing to do it costs one query.
 *
 * NEVER FAILS THE BUILD. Each render is a worker job with the usual heap and
 * deadline (no tenant, no allowance), the whole run stops after RUN_BUDGET_MS,
 * and any failure is logged and exits 0: a row it could not render keeps what
 * it holds, which is no reason to refuse a deploy. Rows past the budget are a
 * warning: they serve their previous render until the next deploy's run or a
 * run by hand reaches them (in turn across organisations).
 */
import { rerenderSchemaTexts } from "@/lib/contracts/rerender";
import { SCHEMA_TEXTS_VERSION } from "@/lib/contracts/render-version";
import { prisma } from "@/lib/db/prisma";

/** The whole run's budget: a few minutes of a build, whatever the rows. */
const RUN_BUDGET_MS = 5 * 60_000;

/** Prisma messages open with a blank line; take the first line that says something. */
const firstLine = (e: unknown): string =>
  e instanceof Error ? (e.message.split("\n").map((l) => l.trim()).find(Boolean) ?? e.name) : "unknown";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("[rerender-schema-texts] skipped: no DATABASE_URL");
    return;
  }
  try {
    const r = await rerenderSchemaTexts({ deadlineAt: Date.now() + RUN_BUDGET_MS });
    console.log(
      `[rerender-schema-texts] version ${SCHEMA_TEXTS_VERSION}: ${r.rendered} rendered, ${r.refused} refused (kept as they were), ${r.skipped} written meanwhile, ${r.left} left`,
    );
    if (r.left > 0) {
      console.warn(
        `[rerender-schema-texts] WARNING: ${r.left} interfaces not reached in ${RUN_BUDGET_MS / 1000} s serve their previous /schema render until the next deploy or a run by hand: pnpm exec tsx scripts/rerender-schema-texts.ts`,
      );
    }
  } catch (err) {
    console.error(`[rerender-schema-texts] not run: ${firstLine(err)}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

void main().then(() => process.exit(0));
