/**
 * Probe SKM ClientRequirement shape to plan the response-back extract.
 * Check: which columns are populated, language of remarks, scope citation
 * structure, sample rows per bucket.
 */
import { prisma } from "../src/lib/db/prisma";

const ID = "cmol80gpu000163u2p9sachff";

async function main() {
  const cols = await prisma.clientRequirement.findFirst({
    where: { assessmentId: ID },
    select: {
      id: true, code: true, module: true, section: true,
      requirementText: true, requirementType: true, requirementClass: true,
      solutionProviderResponse: true, solutionProviderRemarks: true,
      erpModuleSupporting: true, sapModule: true,
      scopeItemIds: true, scopeItemNames: true,
      sortOrder: true,
    },
  });
  console.log("Sample row keys + presence:");
  if (cols) {
    for (const [k, v] of Object.entries(cols)) {
      const isStr = typeof v === "string";
      console.log(`  ${k.padEnd(30)} ${isStr ? `(${v.length} chars)` : typeof v} ${isStr && v.length < 80 ? `: ${JSON.stringify(v)}` : ""}`);
    }
  }

  // Distinct modules + section buckets
  const modules = await prisma.clientRequirement.groupBy({
    by: ["module"],
    where: { assessmentId: ID },
    _count: { _all: true },
    orderBy: { module: "asc" },
  });
  console.log("\nModules:");
  for (const m of modules) console.log(`  ${m.module.padEnd(40)} ${m._count._all}`);

  // 2 sample rows per bucket
  const buckets = ["O", "C", "G", "N"] as const;
  for (const b of buckets) {
    console.log(`\n══ Bucket ${b} samples ══`);
    const rows = await prisma.clientRequirement.findMany({
      where: { assessmentId: ID, solutionProviderResponse: { startsWith: b } },
      select: {
        code: true, module: true, requirementText: true,
        solutionProviderResponse: true, solutionProviderRemarks: true,
        sapModule: true, scopeItemIds: true, scopeItemNames: true,
      },
      take: 3,
    });
    for (const r of rows) {
      console.log(`---`);
      console.log(`code: ${r.code}  module: ${r.module}`);
      console.log(`req: ${r.requirementText.slice(0, 200)}`);
      console.log(`response: ${r.solutionProviderResponse}`);
      console.log(`remarks: ${(r.solutionProviderRemarks ?? "").slice(0, 400)}`);
      console.log(`sapModule: ${r.sapModule ?? ""}`);
      console.log(`scopeItemIds: ${r.scopeItemIds ?? ""}`);
      console.log(`scopeItemNames: ${(r.scopeItemNames ?? "").slice(0, 300)}`);
    }
  }

  // Language probe — count how many remarks contain BM-distinctive tokens
  const allRemarks = await prisma.clientRequirement.findMany({
    where: { assessmentId: ID },
    select: { solutionProviderRemarks: true },
  });
  let bm = 0, en = 0, empty = 0;
  const BM_TOKENS = /\b(yang|dengan|untuk|melalui|tidak|dapat|akan|memerlukan|sudah|telah|adalah|atau|sahaja|berikut|disokong|menyokong|standard|piawai)\b/i;
  const EN_TOKENS = /\b(the|with|using|through|requires|can|will|standard|configuration|configure|process|provided)\b/i;
  for (const r of allRemarks) {
    const t = (r.solutionProviderRemarks ?? "").trim();
    if (!t) { empty++; continue; }
    if (BM_TOKENS.test(t)) bm++;
    else if (EN_TOKENS.test(t)) en++;
  }
  console.log(`\nRemarks language probe: BM-tokens ${bm}  EN-tokens ${en}  empty ${empty}  total ${allRemarks.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
