#!/usr/bin/env tsx
/**
 * P0.8 — stamp SAP's API lifecycle (state, version, successor) from the
 * committed catalogue snapshot onto the catalogue rows that already exist.
 *
 *   pnpm sap:hub:lifecycle            # apply (what vercel-build runs)
 *   pnpm sap:hub:lifecycle --dry-run  # parse and report; write nothing
 *
 * What it writes and why it is safe on every deploy: see
 * src/lib/sap-public/hub-lifecycle-snapshot.ts. In short — existing rows
 * only, the six lifecycle columns only, never a newer stamp reverted, never a
 * recorded successor replaced, and a second run changes nothing.
 *
 * Runs in `vercel-build` after `prisma migrate deploy`. Reads only the file in
 * the build's checkout; no network. `HUB_LIFECYCLE_ON_DEPLOY=off` skips it.
 *
 * A FAILURE DOES NOT FAIL THE DEPLOY. It is reported and the script exits 0:
 * the catalogue then shows exactly what it showed before (no lifecycle data),
 * which is the state production is already in, and blocking an unrelated
 * release on it would trade a known gap for an outage of every other fix.
 * Re-run it by hand, or redeploy, once the cause is fixed
 * (docs/runbooks/coreedge-catalogue-addresses.md).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  applyHubLifecycle,
  HUB_LIFECYCLE_SNAPSHOT_PATH,
  hubLifecycleOnDeploy,
  parseHubLifecycleSnapshot,
} from "@/lib/sap-public/hub-lifecycle-snapshot";

const TAG = "[apply-hub-lifecycle]";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const { mode, warning } = hubLifecycleOnDeploy();
  if (warning) console.warn(`${TAG} ${warning}`);
  if (mode === "off") {
    console.log(`${TAG} HUB_LIFECYCLE_ON_DEPLOY=off — skipped; catalogue lifecycle data left as it is.`);
    return;
  }

  const file = path.resolve(process.cwd(), HUB_LIFECYCLE_SNAPSHOT_PATH);
  const snapshot = parseHubLifecycleSnapshot(JSON.parse(readFileSync(file, "utf-8")));
  const deprecated = snapshot.records.filter((r) => r.hubState === "DEPRECATED");
  console.log(
    `${TAG} ${HUB_LIFECYCLE_SNAPSHOT_PATH}: ${snapshot.records.length} APIs with a Hub state ` +
      `(${deprecated.length} DEPRECATED, ${deprecated.filter((r) => r.successorExternalId).length} with a SAP-named successor); ` +
      `source ${snapshot.source ?? "unrecorded"}, harvested ${snapshot.harvestedAt ?? "on an unrecorded date"}.`,
  );
  if (dryRun) {
    console.log(`${TAG} --dry-run: nothing written.`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const result = await applyHubLifecycle(prisma, snapshot.records);
    console.log(
      `${TAG} stamped ${result.apiReferenceRows} SapApiReference and ${result.hubContentRows} SapHubContent API rows ` +
        "(rows already current, or stamped from a later Hub modification, are left alone).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.message.split("\n").map((l) => l.trim()).find(Boolean) ?? err.name) : String(err);
  console.error(
    `${TAG} FAILED, deploy continues without it — catalogue lifecycle data is unchanged: ${message}. ` +
      "See docs/runbooks/coreedge-catalogue-addresses.md.",
  );
});
