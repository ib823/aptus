/**
 * Gap 1 — validation gauntlet for the AI-drafted Private 2025-FPS1 protocol.
 *
 * Runs a sample of Bursa Public 2602 requirements (which we have signed-off
 * Public verdicts for) against the new Private protocol. The new protocol
 * cites Private scope items, not Public ones, so this is a structural test:
 *   - Bucket distribution sanity (expect more C, less G than Public)
 *   - Hallucination scan (every cited scope item exists in Private 2025-FPS1)
 *   - Citation discipline (every verdict cites ≥1 scope item where applicable)
 *   - Per-bucket transition table vs Public verdict
 *
 * Does NOT write verdicts to the DB — pure read + AI call + report.
 *
 * Requires ANTHROPIC_API_KEY. Cost ≈ $0.30 for 100 requirements.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/_validate-private-protocol.ts
 *   ANTHROPIC_API_KEY=sk-ant-... SAMPLE_SIZE=20 pnpm tsx scripts/_validate-private-protocol.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

const BURSA_ASSESSMENT_ID = "cmofk3zql000163ubn43nkhqy";
const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE ?? "100", 10);
const PROTOCOL_NAME = "SAP 2025-FPS1 Private — AI-drafted v1";
const PROTOCOL_VERSION = "1.0.0-rc1";

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface ClassificationResult {
  requirementId: string;
  classification: string;
  matchedScopeItems: string[];
  remarks: string;
  erpModuleSupporting: string;
  sapModule?: string;
  scopeItemIds?: string;
  scopeItemNames?: string;
  confidence: string;
}

function bucketOf(verdict: string): string | null {
  const v = verdict.toUpperCase();
  if (v.startsWith("O")) return "O";
  if (v.startsWith("C")) return "C";
  if (v.startsWith("G")) return "G";
  if (v.startsWith("N")) return "N/A";
  return null;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in env");
  }

  // 1. Load the protocol
  const protocol = await prisma.classificationProtocol.findUnique({
    where: { name_version: { name: PROTOCOL_NAME, version: PROTOCOL_VERSION } },
  });
  if (!protocol) throw new Error(`Protocol not found: ${PROTOCOL_NAME} v${PROTOCOL_VERSION}`);
  console.log(`Protocol: ${protocol.name} v${protocol.version} (isActive=${protocol.isActive})`);

  // 2. Pick representative Bursa requirements with Public verdicts
  const reqs = await prisma.clientRequirement.findMany({
    where: { assessmentId: BURSA_ASSESSMENT_ID },
    select: {
      id: true,
      module: true,
      code: true,
      requirementText: true,
      requirementType: true,
      clientRemarks: true,
      verdicts: {
        where: { isCurrent: true },
        select: { verdict: true },
        take: 1,
      },
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    take: SAMPLE_SIZE,
  });
  console.log(`Bursa sample: ${reqs.length} requirements`);
  const publicVerdicts = new Map<string, string>();
  for (const r of reqs) {
    const v = r.verdicts[0];
    if (v) publicVerdicts.set(r.id, v.verdict);
  }

  // 3. Pull Private 2025-FPS1 candidate scope items (need scopeCode for the prompt)
  const priv = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
  });
  if (!priv) throw new Error("Private catalog missing");
  const allPrivateItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: priv.id },
    select: { id: true, scopeCode: true, name: true, functionalArea: true, totalSteps: true },
  });
  const privateScopeCodeSet = new Set(allPrivateItems.map((s) => s.scopeCode));
  console.log(`Private 2025-FPS1 catalog candidates: ${allPrivateItems.length}`);

  // For the prompt: cap candidates and keyword-match to relevant ones per batch
  function selectCandidates(reqsBatch: typeof reqs): typeof allPrivateItems {
    const keywords = new Set<string>();
    for (const r of reqsBatch) {
      const words = r.requirementText.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      for (const w of words.slice(0, 30)) keywords.add(w);
      keywords.add(r.module.toLowerCase());
    }
    const scored = allPrivateItems.map((item) => {
      const haystack = `${item.name} ${item.functionalArea ?? ""}`.toLowerCase();
      let score = 0;
      for (const k of keywords) if (haystack.includes(k)) score++;
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 80).map((x) => x.item);
  }

  // 4. Classify in batches of ~20
  const batchSize = 20;
  const allResults: ClassificationResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (let b = 0; b < reqs.length; b += batchSize) {
    const batch = reqs.slice(b, b + batchSize);
    const candidates = selectCandidates(batch);
    const inventoryLines = candidates
      .map((c) => `${c.scopeCode} | ${c.functionalArea ?? "—"} | ${c.name} (${c.totalSteps} steps)`)
      .join("\n");
    const reqLines = batch
      .map(
        (r) =>
          `- id: ${r.id}\n  module: ${r.module} / ${r.code}${r.requirementType ? ` [${r.requirementType}]` : ""}\n  text: ${r.requirementText.replace(/\s+/g, " ").trim().slice(0, 400)}${r.clientRemarks ? `\n  client_note: ${r.clientRemarks.slice(0, 200)}` : ""}`,
      )
      .join("\n\n");
    const userMessage = `## CANDIDATE PRIVATE 2025-FPS1 SCOPE ITEMS (inventory subset)
${inventoryLines}

## REQUIREMENTS TO CLASSIFY
${reqLines}

Classify every requirement above. Return ONLY the JSON object specified.`;

    console.log(`  Batch ${Math.floor(b / batchSize) + 1}/${Math.ceil(reqs.length / batchSize)} (${batch.length} reqs)…`);
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: protocol.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
    }
    const json = (await res.json()) as AnthropicResponse;
    totalInputTokens += json.usage.input_tokens;
    totalOutputTokens += json.usage.output_tokens;
    const text = json.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      console.warn(`  Could not parse JSON from batch ${b}:`, text.slice(0, 300));
      continue;
    }
    const parsed = JSON.parse(m[0]) as { results: ClassificationResult[] };
    allResults.push(...parsed.results);
  }

  console.log(`\nTotal results: ${allResults.length} / ${reqs.length}`);
  console.log(`Tokens: ${totalInputTokens} input + ${totalOutputTokens} output`);
  const cost = (totalInputTokens / 1e6) * 1 + (totalOutputTokens / 1e6) * 5;
  console.log(`Estimated cost: $${cost.toFixed(4)} (Haiku 4.5 pricing)`);

  // ── ANALYSIS ──────────────────────────────────────────────────────────

  // 5. Bucket transition table (Public → Private)
  console.log(`\n=== Bucket transition table (Public 2602 verdict → New Private verdict) ===`);
  const transitions = new Map<string, number>();
  for (const r of allResults) {
    const pub = publicVerdicts.get(r.requirementId);
    if (!pub) continue;
    const pubBucket = bucketOf(pub);
    const privBucket = bucketOf(r.classification);
    const key = `${pubBucket ?? "?"}→${privBucket ?? "?"}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
  }
  const sorted = Array.from(transitions.entries()).sort((a, b) => b[1] - a[1]);
  for (const [t, n] of sorted) console.log(`  ${t.padEnd(8)}  ${n}`);

  // 6. Hallucination scan
  console.log(`\n=== Hallucination scan (cited scope codes that do NOT exist in Private 2025-FPS1) ===`);
  const hallucinated = new Map<string, number>();
  for (const r of allResults) {
    const cites = (r.matchedScopeItems ?? []).filter((c) => !privateScopeCodeSet.has(c));
    for (const c of cites) hallucinated.set(c, (hallucinated.get(c) ?? 0) + 1);
  }
  if (hallucinated.size === 0) {
    console.log(`  ✓ Zero hallucinated codes`);
  } else {
    for (const [c, n] of Array.from(hallucinated.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ⚠️  ${c}  (cited ${n}x)`);
    }
  }

  // 7. Citation discipline
  console.log(`\n=== Citation discipline ===`);
  const noCites = allResults.filter((r) => (r.matchedScopeItems ?? []).length === 0);
  const isApplicable = (r: ClassificationResult) => bucketOf(r.classification) !== "N/A";
  const noCitesApplicable = noCites.filter(isApplicable);
  console.log(`  Total verdicts: ${allResults.length}`);
  console.log(`  No citations:   ${noCites.length} (${noCitesApplicable.length} are O/C/G — should cite)`);

  // 8. Bucket distribution
  console.log(`\n=== Bucket distribution (new Private verdicts) ===`);
  const dist: Record<string, number> = { O: 0, C: 0, G: 0, "N/A": 0 };
  for (const r of allResults) {
    const b = bucketOf(r.classification);
    if (b) dist[b] = (dist[b] ?? 0) + 1;
  }
  const total = allResults.length || 1;
  for (const [b, n] of Object.entries(dist)) {
    console.log(`  ${b.padEnd(4)} ${n.toString().padStart(4)}  (${((n / total) * 100).toFixed(1)}%)`);
  }

  // 9. Spot-check 5 G→C transitions (the most interesting category)
  console.log(`\n=== Spot-check: 5 verdicts where Public said G and Private says C ===`);
  let shown = 0;
  for (const r of allResults) {
    if (shown >= 5) break;
    const pub = publicVerdicts.get(r.requirementId);
    if (pub && bucketOf(pub) === "G" && bucketOf(r.classification) === "C") {
      const reqText = reqs.find((q) => q.id === r.requirementId)?.requirementText ?? "";
      console.log(`  --- ${r.requirementId} (Public: G  →  Private: C) ---`);
      console.log(`  req: ${reqText.slice(0, 200)}…`);
      console.log(`  scope cites: ${(r.matchedScopeItems ?? []).join(", ")}`);
      console.log(`  remarks: ${r.remarks.slice(0, 240)}`);
      console.log("");
      shown++;
    }
  }

  console.log(`\n=== Validation summary ===`);
  console.log(`  Sample size: ${allResults.length}`);
  console.log(`  Hallucinated codes: ${hallucinated.size}`);
  console.log(`  Missing citations (O/C/G): ${noCitesApplicable.length}`);
  console.log(`  G→C transitions (Private extensibility actively used): ${transitions.get("G→C") ?? 0}`);
  console.log(`  Cost: $${cost.toFixed(4)}`);
  console.log(`\nIf the spot-check rationale + bucket distribution + zero hallucinations are acceptable, activate via:`);
  console.log(`  npx tsx scripts/_activate-private-protocol.ts`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
