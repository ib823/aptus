/**
 * Emit all SKM EN remarks for BM translation.
 *
 * Output: /workspaces/aptus/logs/skm-translations-source.json
 *   [{ id, code, module, requirementBm, remarksEn }]
 *
 * Workflow:
 *   1. Run this to produce the source file.
 *   2. Open the file in a separate Claude Code session and ask:
 *        "Translate every `remarksEn` field to Bahasa Malaysia, preserving
 *         SAP technical terminology (scope codes like 1J2, 5XU stay as-is;
 *         module names like FI-GL, MM, SuccessFactors stay as-is). Write
 *         the output to `logs/skm-translations-bm.json` with shape
 *         [{id, remarksBm}]."
 *   3. Run _skm-translate-apply.ts to merge translations + re-export the
 *      response matrix.
 *
 * Batched in chunks so a translator (human or AI) can work module-by-module.
 */

import { prisma } from "../src/lib/db/prisma";
import { mkdir, writeFile } from "fs/promises";

const ID = "cmol80gpu000163u2p9sachff";

async function main() {
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId: ID },
    select: {
      id: true, code: true, module: true,
      requirementText: true, solutionProviderRemarks: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
  });

  const items = reqs
    .filter((r) => (r.solutionProviderRemarks ?? "").trim().length > 0)
    .map((r) => ({
      id: r.id,
      code: r.code,
      module: r.module,
      requirementBm: r.requirementText,
      remarksEn: r.solutionProviderRemarks ?? "",
    }));

  await mkdir("/workspaces/aptus/logs", { recursive: true });
  const outPath = "/workspaces/aptus/logs/skm-translations-source.json";
  await writeFile(outPath, JSON.stringify({ count: items.length, items }, null, 2));
  console.log(`Wrote ${outPath}: ${items.length} items`);

  // Also emit per-module chunks for easier batched translation
  const byModule = new Map<string, typeof items>();
  for (const it of items) {
    const list = byModule.get(it.module) ?? [];
    list.push(it);
    byModule.set(it.module, list);
  }
  await mkdir("/workspaces/aptus/logs/skm-translations-by-module", { recursive: true });
  for (const [mod, list] of byModule) {
    const safe = mod.replace(/[^\w\-]+/g, "_").slice(0, 40);
    await writeFile(
      `/workspaces/aptus/logs/skm-translations-by-module/${safe}.json`,
      JSON.stringify({ module: mod, count: list.length, items: list }, null, 2),
    );
  }
  console.log(`Wrote ${byModule.size} per-module chunks under logs/skm-translations-by-module/`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
