/**
 * 2608 WS16 — regenerate the To-Be pack for a bundle that already exists.
 *
 *   pnpm tobe:regenerate -- --bundle <id> [--out <dir>] [--no-export] [--client-view]
 *
 * `pnpm tobe:preaward` creates a bundle and draws its pack once. There was no
 * supported way to draw it AGAIN, and that gap is what this script closes.
 *
 * It matters because the pack is generated, not written: when the engine, the
 * chain file or the underlying SAP content changes, every existing pack is
 * stale and there is nothing in it that says so. WS16 changed the L1 chains
 * for every finance engagement; without this, the only way to pick that up was
 * to create a second bundle and lose the first one's identity.
 *
 * A regeneration is additive. `generateAndSavePack` writes a NEW TobePack row
 * with its own input hashes; the previous one stays, so what a client was
 * shown last week remains recoverable. Nothing is overwritten and no answers
 * are touched.
 *
 * Client-agnostic: the bundle id is an argument. No client data is in this file.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { generateTobePackPdf } from "@/lib/tobe/export-pdf";
import { generateTobePackPptx } from "@/lib/tobe/export-pptx";
import { generateAndSavePack } from "@/lib/tobe/inputs";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}

async function main(): Promise<void> {
  const bundleId = arg("--bundle");
  if (!bundleId) throw new Error("--bundle <id> is required");
  const outDir = arg("--out") ?? ".";
  const noExport = process.argv.includes("--no-export");
  /*
   * Consultant view by default. The client view strips consultant notes, and
   * exporting it by accident is the cheaper mistake of the two — but writing a
   * consultant pack while believing it is the client one is not, so the flag
   * names the narrower case rather than the wider one.
   */
  const consultantView = !process.argv.includes("--client-view");

  const prisma = new PrismaClient();
  try {
    const bundle = await prisma.affirmBundle.findUnique({
      where: { id: bundleId },
      select: { id: true, client: true, state: true, countries: true },
    });
    if (!bundle) {
      console.error(`\nNo AffirmBundle with id ${bundleId}. Nothing was written.\n`);
      process.exitCode = 1;
      return;
    }

    const before = await prisma.tobePack.count({ where: { bundleId } });
    const got = await generateAndSavePack(prisma as never, bundleId, null);
    if (!got) {
      console.error("\nThe engine returned nothing for this bundle. Nothing was written.\n");
      process.exitCode = 1;
      return;
    }
    const doc = got.doc;

    console.log(`client        ${bundle.client}`);
    console.log(`state         ${bundle.state}`);
    console.log(
      `countries     ${bundle.countries.length > 0 ? bundle.countries.join(", ") : "(not stated — nothing filtered)"}`,
    );
    console.log(`release       ${doc.release}`);
    console.log(
      `chains        ${doc.chains.length}${doc.chains.length ? `  ${doc.chains.map((c) => `${c.id}(${c.items.length})`).join(" ")}` : "  (none — L1 falls back to scope order)"}`,
    );
    console.log(`scope items   ${doc.scopeItems.length}`);
    console.log(`steps         ${doc.summary.steps}`);
    console.log(`disposition   ${JSON.stringify(doc.summary.byDisposition)}`);
    console.log(`packs stored  ${before} → ${before + 1} (the earlier ones are kept)`);

    if (noExport) {
      console.log("\n--no-export: the pack row was written, no files.");
      return;
    }
    const opts = { clientName: bundle.client, consultantView };
    const pptx = await generateTobePackPptx(doc, opts);
    writeFileSync(path.join(outDir, "ToBe-Process-Pack.pptx"), pptx);
    const pdf = await generateTobePackPdf(doc, opts);
    writeFileSync(path.join(outDir, "ToBe-Process-Pack.pdf"), pdf);
    console.log(`\nwrote ToBe-Process-Pack.pptx and .pdf to ${outDir} (${consultantView ? "consultant" : "client"} view)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
