/**
 * AI-powered FIT-to-Standard classifier — Phase 4.
 *
 * Given a batch of ClientRequirements + a candidate inventory subset,
 * call Claude to classify each requirement as OOTB / Configuration / Gap
 * with a grounded narrative pointing at specific 2602 scope items.
 *
 * Uses raw fetch() against the Anthropic API. Requires ANTHROPIC_API_KEY env
 * var. Falls back with clear error if not configured.
 *
 * Cost shape: Haiku 4.5 ($1/MTok in, $5/MTok out). Batch of 30 reqs +
 * 80-item inventory subset ≈ 8K input + 5K output → ~$0.03 per batch.
 * Bursa-scale 778 reqs → ~26 batches → ~$0.80 total. Well under budget.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

export interface CandidateScopeItem {
  id: string;
  name: string;
  functionalArea: string | null;
  totalSteps: number;
  /**
   * Phase 13.3 — AD-13.6: every candidate carries its catalog version so the
   * runtime assert in selectRelevantCandidates() can guarantee no cross-edition
   * leakage. Must equal the assessment.catalogVersionId at the call site.
   */
  catalogVersionId: string;
}

export interface RequirementToClassify {
  id: string;
  module: string;
  code: string;
  requirementText: string;
  requirementType: string | null; // Mandatory | Non-Mandatory
  clientRemarks: string | null;
}

export interface ClassificationResult {
  requirementId: string;
  classification: string; // "O - Out Of The Box" | "C - Configuration" | "G - Gap"
  matchedScopeItems: string[]; // up to 3 scope item IDs from the candidate set
  remarks: string; // SP narrative
  erpModuleSupporting: string; // canonical scope items + descriptors
  confidence: "high" | "medium" | "low";
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

// Phase 2 — AD-4: protocol text lives in the DB (ClassificationProtocol).
// Loaded via loadActiveProtocol(); cached 60s in-process. The previous
// hardcoded SYSTEM_PROMPT const is gone — single source of truth is the
// seeded ClassificationProtocol row.
import { loadActiveProtocol } from "@/lib/analyzer/protocol-loader";
import { findMatchingApis, formatApiEvidenceForPrompt } from "@/lib/classification/api-evidence";
import { prisma } from "@/lib/db/prisma";

function buildUserMessage(
  requirements: RequirementToClassify[],
  candidates: CandidateScopeItem[],
  apiEvidenceBlock: string,
): string {
  const inventoryLines = candidates
    .slice(0, 80) // cap at 80 candidates per batch to control token use
    .map((c) => `${c.id} | ${c.functionalArea ?? "—"} | ${c.name} (${c.totalSteps} steps)`)
    .join("\n");

  const reqLines = requirements
    .map(
      (r) =>
        `- id: ${r.id}\n  module: ${r.module} / ${r.code}${r.requirementType ? ` [${r.requirementType}]` : ""}\n  text: ${r.requirementText.replace(/\s+/g, " ").trim().slice(0, 400)}${r.clientRemarks ? `\n  client_note: ${r.clientRemarks.slice(0, 200)}` : ""}`,
    )
    .join("\n\n");

  // Phase 13.6: API evidence is appended only when the SapApiReference table
  // has matching rows. Empty string when table is empty (no behavior change).
  return `## CANDIDATE SCOPE ITEMS (inventory subset)
${inventoryLines}

## REQUIREMENTS TO CLASSIFY
${reqLines}${apiEvidenceBlock}

Classify every requirement above. Return ONLY the JSON object specified.`;
}

export async function classifyBatch(
  requirements: RequirementToClassify[],
  candidates: CandidateScopeItem[],
  opts: { catalogVersionId: string },
): Promise<{ results: ClassificationResult[]; usage: { inputTokens: number; outputTokens: number }; protocolVersionId: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured — set it in Vercel env to enable AI analysis");
  }

  // Phase 13.3 — AD-13.6 defense-in-depth: refuse any candidate whose catalog
  // doesn't match the assessment's. Pre-filtering at the orchestrator
  // (pass-data / route.ts findMany) is the primary safeguard; this assert
  // catches future regressions.
  for (const c of candidates) {
    if (c.catalogVersionId !== opts.catalogVersionId) {
      throw new Error(
        `Catalog filter violation: candidate ${c.id} (${c.name}) is in catalog ${c.catalogVersionId}, ` +
        `assessment is pinned to ${opts.catalogVersionId}. Refusing to classify across editions.`,
      );
    }
  }

  // Phase 13.3 — AD-13.5: load the protocol pinned to the assessment's catalog
  // version. Each catalog has its own active protocol (Public 2602's protocol
  // ≠ Private 2025-FPS1's protocol because BAdI / classic-config availability
  // differs).
  const protocol = await loadActiveProtocol(opts.catalogVersionId);

  // Phase 13.6 — pull API evidence from the SapApiReference table. The catalog
  // edition (PUBLIC / PRIVATE / ON_PREM) gates which APIs are visible to this
  // assessment so a Public-only API never grounds a Private classification.
  // Returns an empty array (and an empty string block) if the table is empty
  // — zero behavior change relative to pre-Phase-13.6 in that case.
  const catalog = await prisma.scopeCatalogVersion.findUnique({
    where: { id: opts.catalogVersionId },
    select: { edition: true },
  });
  const candidateScopeCodes = Array.from(new Set(candidates.map((c) => c.id))); // candidate.id IS the scope code for legacy Public; for Private it's a cuid — we use scopeCode lookup below
  // For Private edition, candidate.id is a cuid. Convert to scopeCode for the API match.
  const candidatesWithScopeCodes = await prisma.scopeItem.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    select: { scopeCode: true },
  });
  const allScopeCodes = Array.from(new Set([
    ...candidateScopeCodes, // Public legacy: id == scopeCode, so this catches them
    ...candidatesWithScopeCodes.map((s) => s.scopeCode),
  ]));
  const matchedApis = catalog
    ? await findMatchingApis({
        scopeItemCodes: allScopeCodes,
        catalogEdition: catalog.edition,
        acceptedStatuses: ["Released"],
        limit: 12,
      })
    : [];
  const apiEvidenceBlock = formatApiEvidenceForPrompt(matchedApis);

  const userMessage = buildUserMessage(requirements, candidates, apiEvidenceBlock);

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
      system: protocol.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as AnthropicResponse;
  const text = json.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  // Parse the JSON response (strip any prefix/suffix the model added)
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    throw new Error(`Could not extract JSON from response: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(m[0]) as { results: ClassificationResult[] };
  if (!Array.isArray(parsed.results)) {
    throw new Error("Response missing 'results' array");
  }

  return {
    results: parsed.results,
    usage: {
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
    },
    protocolVersionId: protocol.id,
  };
}

/**
 * Pre-filter the inventory to a relevant subset for a batch of requirements.
 * Heuristic: union of scope items whose name or functional area mentions any
 * keyword from the requirement texts. Capped at 80 items.
 *
 * Phase 13.3: catalogVersionId is required. Every input is asserted to belong
 * to the same catalog — caller is expected to pre-filter `findMany()` by
 * catalogVersionId; this assert catches accidental mixing.
 */
export function selectRelevantCandidates(
  allItems: CandidateScopeItem[],
  requirements: RequirementToClassify[],
  opts: { catalogVersionId: string; limit?: number },
): CandidateScopeItem[] {
  const limit = opts.limit ?? 80;
  for (const item of allItems) {
    if (item.catalogVersionId !== opts.catalogVersionId) {
      throw new Error(
        `Catalog filter violation in selectRelevantCandidates: item ${item.id} ` +
        `(catalog ${item.catalogVersionId}) does not match expected ${opts.catalogVersionId}.`,
      );
    }
  }
  const keywords = new Set<string>();
  for (const r of requirements) {
    const words = r.requirementText
      .toLowerCase()
      .match(/[a-z]{4,}/g) ?? [];
    for (const w of words.slice(0, 30)) keywords.add(w);
    keywords.add(r.module.toLowerCase());
  }

  const scored = allItems.map((item) => {
    const haystack = `${item.name} ${item.functionalArea ?? ""}`.toLowerCase();
    let score = 0;
    for (const k of keywords) {
      if (haystack.includes(k)) score++;
    }
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).filter((x) => x.score > 0);
  // If filtering produces too few, pad with first N items by step count desc
  if (top.length < 20) {
    const fallback = [...allItems]
      .sort((a, b) => b.totalSteps - a.totalSteps)
      .slice(0, limit - top.length);
    const seen = new Set(top.map((x) => x.item.id));
    for (const f of fallback) {
      if (!seen.has(f.id)) top.push({ item: f, score: 0 });
      if (top.length >= limit) break;
    }
  }
  return top.map((x) => x.item);
}
