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

const SYSTEM_PROMPT = `You are a SAP FIT-to-Standard analyst working with the SAP S/4HANA Cloud Public Edition 2602 catalog.

Your job: given a batch of client requirements + a list of candidate 2602 scope items, classify each requirement and produce a grounded narrative.

CLASSIFICATION RULES (use exact strings):
- "O - Out Of The Box" — capability is in the 2602 baseline, no customization needed
- "C - Configuration" — capability needs SSCUI / Key User Extensibility / Output Management / Manage Workflows setup, all within 2602 baseline
- "G - Gap" — requires a separate licensed SAP product (SuccessFactors EC, Ariba, SAC Planning, SAC Smart Predict, SAP Commerce Cloud, etc.) OR a 3rd-party tool (ONESOURCE/Vertex for corporate tax, etc.) — NOT in 2602 baseline

GROUNDING RULES:
- Reference scope items by ID (e.g., "5XU Document and Reporting Compliance")
- Be brutally honest about Gaps — do not invent OOTB coverage that doesn't exist in the candidate list
- For Configuration, name the specific config mechanism (SSCUI / KUE / Adapt UI / Manage Workflows / Output Management / Adobe Forms / Communication Arrangement)
- For Gap, explicitly name the separate product needed and note any partial workaround within 2602
- "matchedScopeItems" should be the top 1-3 scope item IDs from the candidate list that cover this requirement; empty array if none match (then it's a Gap by definition)

OUTPUT FORMAT — strict JSON, no preamble, no markdown:
{
  "results": [
    {
      "requirementId": "<id>",
      "classification": "<O - Out Of The Box | C - Configuration | G - Gap>",
      "matchedScopeItems": ["<id1>", "<id2>"],
      "remarks": "<one paragraph, 60-200 words, grounded in scope items>",
      "erpModuleSupporting": "<scope item id + name pattern, e.g. '5XU Document and Reporting Compliance + 1J2 Compliance Formats'>",
      "confidence": "<high | medium | low>"
    }
  ]
}`;

function buildUserMessage(
  requirements: RequirementToClassify[],
  candidates: CandidateScopeItem[],
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

  return `## CANDIDATE 2602 SCOPE ITEMS (inventory subset)
${inventoryLines}

## REQUIREMENTS TO CLASSIFY
${reqLines}

Classify every requirement above. Return ONLY the JSON object specified.`;
}

export async function classifyBatch(
  requirements: RequirementToClassify[],
  candidates: CandidateScopeItem[],
): Promise<{ results: ClassificationResult[]; usage: { inputTokens: number; outputTokens: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured — set it in Vercel env to enable AI analysis");
  }

  const userMessage = buildUserMessage(requirements, candidates);

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
      system: SYSTEM_PROMPT,
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
  };
}

/**
 * Pre-filter the inventory to a relevant subset for a batch of requirements.
 * Heuristic: union of scope items whose name or functional area mentions any
 * keyword from the requirement texts. Capped at 80 items.
 */
export function selectRelevantCandidates(
  allItems: CandidateScopeItem[],
  requirements: RequirementToClassify[],
  limit = 80,
): CandidateScopeItem[] {
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
