/**
 * TIME RFT Phase 4 — link CustomerProcess rows to ClientRequirement rows.
 *
 * Strategy (deterministic; no LLM needed for the v1 pass):
 *
 *   Tier 1 — Exact RTM ID match (HIGH confidence):
 *     If a requirement's clientRemarks (the original Doc Ref hint from
 *     App 2 Excel col 4) contains one or more RTM IDs (e.g. "FI.006" or
 *     "FI.007/FI.008"), look up CustomerProcess rows whose processName
 *     contains any of those IDs. Each match becomes a high-confidence
 *     CustomerProcessRequirementLink.
 *
 *   Tier 2 — Section-keyword match (MEDIUM confidence):
 *     If clientRemarks is descriptive (e.g. "Enterprise Structure",
 *     "Bank Reconciliation"), perform keyword overlap against
 *     CustomerProcess.processName + parentSection. Match if ≥2 significant
 *     words (length > 4) overlap.
 *
 *   Tier 3 — Requirement-text keyword match (LOW confidence):
 *     For requirements without Doc Ref hints OR where Tier 1 + 2 found
 *     no match, tokenize the requirement text and search CustomerProcess
 *     names for ≥2 word overlaps. Confidence "low".
 *
 *   Tier 4 — No match:
 *     Requirements that don't link to any CustomerProcess via the above
 *     are recorded with no link (the Phase 3 schema allows zero links).
 *     The classifier still uses the SAP catalog grounding without a
 *     customer-process anchor for these.
 *
 * Idempotent — wipes prior links for this assessment + reinserts.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/link-processes-to-requirements.ts
 */

import { prisma } from "../../src/lib/db/prisma";

const ASSESSMENT_COMPANY = "T.I.M.E. dotCom Bhd";

// Stop words that don't carry meaning for matching
const STOP_WORDS = new Set([
  "the", "shall", "should", "will", "must", "may", "can", "and", "or", "but",
  "for", "with", "from", "into", "onto", "this", "that", "these", "those",
  "support", "supports", "supported", "ensure", "ensures", "provide", "provides",
  "provided", "system", "solution", "solutions", "process", "processes",
  "have", "has", "been", "being", "their", "there", "where", "when", "what",
  "all", "any", "some", "such", "each", "every", "other", "another",
  "implement", "implementation", "implemented", "manage", "management", "managed",
  "include", "includes", "included", "including", "able", "ability",
  "user", "users", "data", "information",
]);

interface RtmIdMatch {
  rtmId: string;
  customerProcessId: string;
}

function extractRtmIds(text: string): string[] {
  // Match RTM IDs: 2-letter prefix + dot + 3-digit number, e.g. "FI.006", "MD.003"
  // Also handle "FI.007/FI.008" by matching all
  const rx = /\b([A-Z]{2,3})\.(\d{3})\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    out.add(`${m[1]}.${m[2]}`);
  }
  return Array.from(out);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w));
}

interface CustomerProcessForMatch {
  id: string;
  processName: string;
  parentSection: string | null;
  rtmIdsInName: string[];
  tokens: Set<string>;
}

async function main(): Promise<void> {
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: ASSESSMENT_COMPANY, deletedAt: null },
    select: { id: true },
  });
  if (!assessment) throw new Error(`Assessment for ${ASSESSMENT_COMPANY} not found`);
  console.log(`[time-link] Assessment: ${assessment.id}`);

  const requirements = await prisma.clientRequirement.findMany({
    where: { assessmentId: assessment.id },
    select: {
      id: true,
      code: true,
      module: true,
      section: true,
      requirementText: true,
      clientRemarks: true,
    },
  });
  console.log(`[time-link] Loaded ${requirements.length} requirements`);

  const processes = await prisma.customerProcess.findMany({
    where: { assessmentId: assessment.id },
    select: { id: true, processName: true, parentSection: true },
  });
  const processesIndexed: CustomerProcessForMatch[] = processes.map((p) => ({
    id: p.id,
    processName: p.processName,
    parentSection: p.parentSection,
    rtmIdsInName: extractRtmIds(p.processName),
    tokens: new Set([
      ...tokenize(p.processName),
      ...(p.parentSection ? tokenize(p.parentSection) : []),
    ]),
  }));
  console.log(`[time-link] Loaded ${processes.length} customer processes`);
  const withRtm = processesIndexed.filter((p) => p.rtmIdsInName.length > 0).length;
  console.log(`[time-link]   ${withRtm} have RTM IDs in name`);

  // Build RTM ID → process index for fast lookup
  const rtmIndex = new Map<string, string[]>(); // rtmId → process IDs
  for (const p of processesIndexed) {
    for (const rid of p.rtmIdsInName) {
      const list = rtmIndex.get(rid) ?? [];
      list.push(p.id);
      rtmIndex.set(rid, list);
    }
  }

  // Wipe prior links
  const wiped = await prisma.customerProcessRequirementLink.deleteMany({
    where: { requirement: { assessmentId: assessment.id } },
  });
  console.log(`[time-link] Wiped ${wiped.count} prior links`);

  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  let noMatchCount = 0;
  const linksToInsert: Array<{
    customerProcessId: string;
    requirementId: string;
    matchType: string;
    confidence: string;
    rationale: string;
  }> = [];
  const seenPairs = new Set<string>(); // dedup per (process, requirement)

  for (const req of requirements) {
    const docHint = req.clientRemarks?.trim() ?? "";

    // Tier 1: RTM ID exact match
    const rtmIdsInHint = extractRtmIds(docHint);
    if (rtmIdsInHint.length > 0) {
      let tier1Linked = 0;
      for (const rid of rtmIdsInHint) {
        const procIds = rtmIndex.get(rid) ?? [];
        for (const pid of procIds) {
          const key = `${pid}::${req.id}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          linksToInsert.push({
            customerProcessId: pid,
            requirementId: req.id,
            matchType: "KEYWORD",
            confidence: "high",
            rationale: `Exact RTM ID match: requirement Doc Ref "${docHint}" → CustomerProcess named after ${rid}.`,
          });
          tier1Linked++;
        }
      }
      if (tier1Linked > 0) {
        tier1Count++;
        continue;
      }
    }

    // Tier 2: descriptive Doc Ref keyword match
    if (docHint && !/^\s*[A-Z]{2,3}\.\d{3}/.test(docHint)) {
      const hintTokens = new Set(tokenize(docHint));
      if (hintTokens.size >= 1) {
        let tier2Linked = 0;
        for (const p of processesIndexed) {
          const overlap = [...hintTokens].filter((t) => p.tokens.has(t));
          if (overlap.length >= 1 && hintTokens.size >= 2) {
            // Need ≥2 tokens in hint AND at least 1 overlap; OR strong single-word match
            const key = `${p.id}::${req.id}`;
            if (seenPairs.has(key)) continue;
            seenPairs.add(key);
            linksToInsert.push({
              customerProcessId: p.id,
              requirementId: req.id,
              matchType: "KEYWORD",
              confidence: "medium",
              rationale: `Doc Ref hint "${docHint}" overlaps with process "${p.processName}" on: ${overlap.join(", ")}`,
            });
            tier2Linked++;
            if (tier2Linked >= 5) break; // cap
          }
        }
        if (tier2Linked > 0) {
          tier2Count++;
          continue;
        }
      }
    }

    // Tier 3: requirement-text keyword match
    const reqTokens = new Set(tokenize(req.requirementText.slice(0, 500)));
    if (reqTokens.size >= 3) {
      let tier3Linked = 0;
      for (const p of processesIndexed) {
        const overlap = [...reqTokens].filter((t) => p.tokens.has(t));
        if (overlap.length >= 2) {
          const key = `${p.id}::${req.id}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          linksToInsert.push({
            customerProcessId: p.id,
            requirementId: req.id,
            matchType: "KEYWORD",
            confidence: "low",
            rationale: `Requirement text shares ${overlap.length} significant words with process "${p.processName}": ${overlap.slice(0, 5).join(", ")}`,
          });
          tier3Linked++;
          if (tier3Linked >= 3) break;
        }
      }
      if (tier3Linked > 0) {
        tier3Count++;
        continue;
      }
    }

    noMatchCount++;
  }

  // Bulk insert
  console.log(`[time-link] Inserting ${linksToInsert.length} links...`);
  const chunkSize = 500;
  for (let i = 0; i < linksToInsert.length; i += chunkSize) {
    await prisma.customerProcessRequirementLink.createMany({
      data: linksToInsert.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  console.log(``);
  console.log(`[time-link] Done.`);
  console.log(`  Total requirements           : ${requirements.length}`);
  console.log(`  Tier 1 (high — RTM exact)    : ${tier1Count}`);
  console.log(`  Tier 2 (medium — desc hint)  : ${tier2Count}`);
  console.log(`  Tier 3 (low — req text only) : ${tier3Count}`);
  console.log(`  No match                     : ${noMatchCount}`);
  console.log(`  Total links inserted         : ${linksToInsert.length}`);
  console.log(`  Coverage                     : ${(((requirements.length - noMatchCount) / requirements.length) * 100).toFixed(1)}%`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[time-link] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
