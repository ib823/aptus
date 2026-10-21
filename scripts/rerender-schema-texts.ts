#!/usr/bin/env tsx
/**
 * Re-render every interface's GET /schema texts at the running
 * SCHEMA_TEXTS_VERSION, from the stored rows (P1.3, consolidated review
 * round 2; src/lib/contracts/rerender.ts says which rows and how).
 *
 * WHEN IT RUNS. In `vercel-build`, after the migrations and `prisma
 * generate`, so a deploy that bumps SCHEMA_TEXTS_VERSION re-renders the texts
 * before it serves a request: no interface answers NOT_RENDERED for want of a
 * re-verify against its SAP system. After a Vercel Instant Rollback across a
 * bump, run the rolled-back deployment's own script once by hand (its
 * checkout, the production DATABASE_URL): `pnpm exec tsx
 * scripts/rerender-schema-texts.ts`. With nothing to do it costs one query.
 *
 * NEVER FAILS THE BUILD. Each render is a worker job with the usual heap and
 * deadline (no tenant, no allowance), the whole run stops after RUN_BUDGET_MS,
 * and any failure is logged and exits 0: a row it could not render stays
 * NOT_RENDERED (a verify or a capture renders it), which is no reason to
 * refuse a deploy. Rows past it are said in the log; run it again.
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
      `[rerender-schema-texts] version ${SCHEMA_TEXTS_VERSION}: ${r.rendered} rendered, ${r.refused} refused (NOT_RENDERED), ${r.skipped} written meanwhile, ${r.left} left for the next run`,
    );
  } catch (err) {
    console.error(`[rerender-schema-texts] not run: ${firstLine(err)}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

void main().then(() => process.exit(0));
