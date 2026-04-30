/**
 * Gap 3 — populate functionalArea + subArea for all Private 2025-FPS1 ScopeItems.
 *
 * Strategy:
 *   1. CROSS-REF: For each Private code that also exists in Public 2602 with a
 *      non-Uncategorized area, copy area + subArea (whitespace-normalized).
 *   2. AI INFER: For the remainder, send name + purposeHtml to Claude (single
 *      batched call). Claude picks from the canonical SAP taxonomy.
 *
 * Then exhaustive verification:
 *   - Zero Uncategorized remaining for Private
 *   - Distribution sanity (each area has plausible count vs Public)
 *   - Cross-edition consistency (overlap codes match Public area exactly)
 *   - Spot-check 10 cross-ref + 10 AI-inferred (printed for human review)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Canonical SAP functional area taxonomy (deduped from Public 2602 + trimmed).
// Used both as the source of truth for cross-ref normalization and as the
// constrained-choice list for AI inference.
const CANONICAL_AREAS = [
  "Finance",
  "Sourcing and Procurement",
  "Manufacturing",
  "Supply Chain",
  "Sales",
  "Organization",
  "Logistics",
  "R&D/Engineering",
  "Quality Management",
  "Database and Data Management",
  "Enterprise Portfolio & Project Management",
  "Service",
  "Application Platform and Infrastructure",
  "Professional Services",
  "Human Resources",
  "Asset Management",
  "Oil and Gas",
  "Cross Topics",
];

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

interface InferenceItem {
  scopeCode: string;
  name: string;
  purposeHtml: string;
}
interface InferenceResult {
  scopeCode: string;
  functionalArea: string;
  subArea: string;
  reason: string;
}

function normalizeAreaName(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed === "Uncategorized") return null;
  // Match against canonical (case-insensitive); fall back to as-is trimmed
  for (const c of CANONICAL_AREAS) {
    if (c.toLowerCase() === trimmed.toLowerCase()) return c;
  }
  return trimmed;
}

async function inferAreasViaAi(items: InferenceItem[]): Promise<InferenceResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  if (items.length === 0) return [];

  // Batch into groups of 30 to stay under prompt + output token limits
  const batches: InferenceItem[][] = [];
  for (let i = 0; i < items.length; i += 30) batches.push(items.slice(i, i + 30));

  const all: InferenceResult[] = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    const itemLines = batch
      .map(
        (it) =>
          `- code: ${it.scopeCode}\n  name: ${it.name}\n  purpose_excerpt: ${it.purposeHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 350)}`,
      )
      .join("\n\n");

    const userMessage = `Classify each SAP scope item below into ONE of the canonical SAP functional areas. Pick from this exact list:

${CANONICAL_AREAS.map((a) => `  - ${a}`).join("\n")}

Also infer a sub-area (more granular, ≤30 chars) — use SAP's standard sub-area names like "Accounts Payable", "Treasury and Risk Management", "Sales Order Management", "Procurement of Direct Materials", "Plant Maintenance", etc. If sub-area is unclear, repeat the functional area name.

Return STRICT JSON only:
{
  "results": [
    { "scopeCode": "J60", "functionalArea": "Finance", "subArea": "Accounts Payable", "reason": "<one short sentence>" },
    ...
  ]
}

## SCOPE ITEMS TO CLASSIFY (${batch.length})
${itemLines}`;

    console.log(`  AI inference batch ${b + 1}/${batches.length} (${batch.length} items)…`);
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system:
          "You are a SAP S/4HANA Cloud functional architect. You assign scope items to canonical SAP functional areas with high precision. Always pick from the provided canonical list — never invent new area names.",
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
    }
    const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = json.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Could not parse JSON from AI response: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(m[0]) as { results: InferenceResult[] };
    if (!Array.isArray(parsed.results)) throw new Error("Response missing results array");
    all.push(...parsed.results);
  }
  return all;
}

async function main(): Promise<void> {
  const priv = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
  });
  const pub = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2602", edition: "PUBLIC" } },
  });
  if (!priv || !pub) throw new Error("Catalogs missing");

  const privItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: priv.id },
    select: { id: true, scopeCode: true, name: true, purposeHtml: true, functionalArea: true },
  });
  const pubItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: pub.id },
    select: { scopeCode: true, functionalArea: true, subArea: true },
  });
  const pubByCode = new Map(pubItems.map((p) => [p.scopeCode, p]));

  console.log(`Private items: ${privItems.length}`);
  console.log(`Public 2602 items: ${pubItems.length}`);

  // ── Step 1: Cross-reference ─────────────────────────────────────────────
  console.log(`\n=== Step 1: Cross-reference with Public 2602 ===`);
  let crossRefFilled = 0;
  const needAi: typeof privItems = [];
  for (const p of privItems) {
    const pubMatch = pubByCode.get(p.scopeCode);
    const cleanArea = pubMatch ? normalizeAreaName(pubMatch.functionalArea) : null;
    const cleanSub = pubMatch ? normalizeAreaName(pubMatch.subArea) : null;
    if (cleanArea) {
      await prisma.scopeItem.update({
        where: { id: p.id },
        data: {
          functionalArea: cleanArea,
          subArea: cleanSub ?? cleanArea,
        },
      });
      crossRefFilled++;
    } else {
      needAi.push(p);
    }
  }
  console.log(`  Cross-ref filled: ${crossRefFilled}`);
  console.log(`  Need AI inference: ${needAi.length}`);

  // ── Step 2: AI inference for the remainder ──────────────────────────────
  console.log(`\n=== Step 2: AI inference for ${needAi.length} items ===`);
  const inferenceInput: InferenceItem[] = needAi.map((p) => ({
    scopeCode: p.scopeCode,
    name: p.name,
    purposeHtml: p.purposeHtml,
  }));
  const inferred = await inferAreasViaAi(inferenceInput);

  let aiFilled = 0;
  let aiInvalid = 0;
  const inferredByCode = new Map(inferred.map((i) => [i.scopeCode, i]));
  for (const p of needAi) {
    const result = inferredByCode.get(p.scopeCode);
    if (!result) {
      console.warn(`  ?? ${p.scopeCode} — AI did not return a result`);
      aiInvalid++;
      continue;
    }
    const cleanArea = normalizeAreaName(result.functionalArea);
    if (!cleanArea || !CANONICAL_AREAS.includes(cleanArea)) {
      console.warn(`  ?? ${p.scopeCode} — AI returned unknown area "${result.functionalArea}"`);
      aiInvalid++;
      continue;
    }
    await prisma.scopeItem.update({
      where: { id: p.id },
      data: {
        functionalArea: cleanArea,
        subArea: result.subArea?.trim() || cleanArea,
      },
    });
    aiFilled++;
  }
  console.log(`  AI filled: ${aiFilled}`);
  console.log(`  AI invalid (skipped): ${aiInvalid}`);

  // ── Step 3: EXHAUSTIVE VERIFICATION ─────────────────────────────────────
  console.log(`\n=== Step 3: Exhaustive verification ===`);

  // 3a. Zero Uncategorized for Private
  const remainingUncat = await prisma.scopeItem.count({
    where: { catalogVersionId: priv.id, functionalArea: "Uncategorized" },
  });
  console.log(`  3a. Private items still Uncategorized: ${remainingUncat} (expect 0)`);
  if (remainingUncat > 0) {
    const stragglers = await prisma.scopeItem.findMany({
      where: { catalogVersionId: priv.id, functionalArea: "Uncategorized" },
      select: { scopeCode: true, name: true },
    });
    for (const s of stragglers) console.log(`    - ${s.scopeCode}  ${s.name}`);
  }

  // 3b. Distribution
  const dist = await prisma.scopeItem.groupBy({
    by: ["functionalArea"],
    where: { catalogVersionId: priv.id },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  console.log(`\n  3b. Private functional area distribution:`);
  for (const d of dist) console.log(`    ${d._count.id.toString().padStart(4)}  ${d.functionalArea}`);

  // 3c. Cross-edition consistency
  const both = await prisma.scopeItem.findMany({
    where: { catalogVersionId: priv.id, scopeCode: { in: pubItems.filter((p) => normalizeAreaName(p.functionalArea)).map((p) => p.scopeCode) } },
    select: { scopeCode: true, functionalArea: true },
  });
  let inconsistent = 0;
  for (const b of both) {
    const pubArea = normalizeAreaName(pubByCode.get(b.scopeCode)?.functionalArea ?? null);
    if (pubArea && pubArea !== b.functionalArea) {
      console.warn(`    INCONSISTENT: ${b.scopeCode} → Private="${b.functionalArea}" vs Public="${pubArea}"`);
      inconsistent++;
    }
  }
  console.log(`\n  3c. Cross-edition consistency check: ${inconsistent} mismatches (expect 0 for cross-ref'd codes)`);

  // 3d. Spot-check 10 cross-ref + 10 AI-inferred
  const sampleCross = await prisma.scopeItem.findMany({
    where: { catalogVersionId: priv.id, scopeCode: { in: privItems.filter(p => pubByCode.has(p.scopeCode) && normalizeAreaName(pubByCode.get(p.scopeCode)!.functionalArea)).slice(0, 10).map(p => p.scopeCode) } },
    select: { scopeCode: true, name: true, functionalArea: true, subArea: true },
  });
  console.log(`\n  3d. Spot-check — 10 CROSS-REF samples (Private name → assigned area):`);
  for (const s of sampleCross) console.log(`    ${s.scopeCode.padEnd(5)}  ${s.name.slice(0, 50).padEnd(52)}  → ${s.functionalArea} / ${s.subArea}`);

  const aiCodes = needAi.slice(0, 10).map(p => p.scopeCode);
  const sampleAi = await prisma.scopeItem.findMany({
    where: { catalogVersionId: priv.id, scopeCode: { in: aiCodes } },
    select: { scopeCode: true, name: true, functionalArea: true, subArea: true },
  });
  console.log(`\n      Spot-check — 10 AI-INFERRED samples (Private name → AI-assigned area):`);
  for (const s of sampleAi) console.log(`    ${s.scopeCode.padEnd(5)}  ${s.name.slice(0, 50).padEnd(52)}  → ${s.functionalArea} / ${s.subArea}`);

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`  Private items total:        ${privItems.length}`);
  console.log(`  Cross-ref filled:           ${crossRefFilled}`);
  console.log(`  AI-inferred filled:         ${aiFilled}`);
  console.log(`  AI invalid (skipped):       ${aiInvalid}`);
  console.log(`  Still Uncategorized:        ${remainingUncat}`);
  console.log(`  Cross-edition mismatches:   ${inconsistent}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
