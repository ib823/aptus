/**
 * Heuristic backfill of SapApiReference.scopeItemCodes.
 *
 * The api.sap.com extraction left scopeItemCodes empty (the linkage lives
 * inside per-API OpenAPI specs which weren't downloaded). This script
 * populates the field via substring matching:
 *
 *   For each ScopeItem, take its nameClean (without the "(J60)" suffix),
 *   filter to entries ≥ MIN_NAME_LEN chars (avoid false positives on short
 *   common words). For each SapApiReference, search apiName + description
 *   for occurrences of any qualifying nameClean. If found, add the
 *   corresponding scopeCode to scopeItemCodes.
 *
 * Coverage expectation: 60-70%. False-positive rate: low because most
 * ScopeItem nameCleans are distinctive 12-30 char process names. False
 * negatives: APIs whose names use abbreviations (e.g. "AP" vs
 * "Accounts Payable") won't match; ~30% of catalog estimated affected.
 *
 * Idempotent — overwrites scopeItemCodes with the heuristic result. Re-run
 * after refreshing the catalog or expanding the scope-item set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MIN_NAME_LEN = 8; // ignore scope item names shorter than this for matching

// Scope items whose nameClean is too generic to match safely (manually curated).
// Without this list, "Activity Management" matches every SAP API with the
// word "activity" in it, etc. Empty for now; expand as false positives surface.
const NAME_BLOCKLIST = new Set<string>([
  // Add nameClean strings here that proved to over-match on first run.
]);

interface ScopeItemForMatch {
  scopeCode: string;
  nameClean: string;
  matchPattern: RegExp;
}

async function main(): Promise<void> {
  // Step 1: Build the scope-item match dictionary (deduped by nameClean across editions)
  const allItems = await prisma.scopeItem.findMany({
    select: { scopeCode: true, nameClean: true },
  });
  const byCode = new Map<string, string>(); // scopeCode → nameClean (one canonical)
  for (const it of allItems) {
    if (!byCode.has(it.scopeCode)) byCode.set(it.scopeCode, it.nameClean);
  }

  const matchable: ScopeItemForMatch[] = [];
  let skipped = 0;
  for (const [scopeCode, nameClean] of byCode) {
    const trimmed = nameClean.trim();
    if (trimmed.length < MIN_NAME_LEN) {
      skipped++;
      continue;
    }
    if (NAME_BLOCKLIST.has(trimmed)) {
      skipped++;
      continue;
    }
    // Use word-boundary regex to avoid partial-word matches
    // (e.g. "Cash" should not match "Cashflow" via simple substring)
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matchable.push({
      scopeCode,
      nameClean: trimmed,
      matchPattern: new RegExp(`\\b${escaped}\\b`, "i"),
    });
  }
  console.log(`Scope items: ${allItems.length} total, ${byCode.size} distinct codes, ${matchable.length} matchable (len ≥ ${MIN_NAME_LEN}), ${skipped} skipped`);

  // Step 2: For each API, scan apiName + description for matches
  const apis = await prisma.sapApiReference.findMany({
    select: { id: true, apiId: true, apiName: true, description: true },
  });
  console.log(`APIs to scan: ${apis.length}`);

  let totalMatches = 0;
  let apisWithMatches = 0;
  let apisNoMatch = 0;
  let maxMatchesPerApi = 0;
  let updated = 0;
  const matchHistogram = new Map<number, number>(); // matches-per-api → count

  for (const api of apis) {
    const haystack = `${api.apiName} ${api.description}`;
    const hits: Set<string> = new Set();
    for (const m of matchable) {
      if (m.matchPattern.test(haystack)) hits.add(m.scopeCode);
    }
    const codes = Array.from(hits).sort();

    if (codes.length === 0) {
      apisNoMatch++;
    } else {
      apisWithMatches++;
      totalMatches += codes.length;
      maxMatchesPerApi = Math.max(maxMatchesPerApi, codes.length);
    }
    matchHistogram.set(codes.length, (matchHistogram.get(codes.length) ?? 0) + 1);

    // Update the row (cap at 20 codes per API to keep arrays bounded)
    const capped = codes.slice(0, 20);
    await prisma.sapApiReference.update({
      where: { id: api.id },
      data: { scopeItemCodes: capped },
    });
    updated++;

    if (updated % 250 === 0) console.log(`  ... ${updated}/${apis.length} updated`);
  }

  console.log("");
  console.log("=== Heuristic match results ===");
  console.log(`  APIs with ≥1 match: ${apisWithMatches} (${((apisWithMatches / apis.length) * 100).toFixed(1)}%)`);
  console.log(`  APIs with 0 matches: ${apisNoMatch} (${((apisNoMatch / apis.length) * 100).toFixed(1)}%)`);
  console.log(`  Total scope-code links: ${totalMatches}`);
  console.log(`  Avg matches per API (excluding 0-match): ${(totalMatches / Math.max(1, apisWithMatches)).toFixed(1)}`);
  console.log(`  Max matches in one API: ${maxMatchesPerApi}`);

  console.log("\n=== Match-count histogram ===");
  const sortedHist = Array.from(matchHistogram.entries()).sort((a, b) => a[0] - b[0]);
  for (const [n, c] of sortedHist) {
    if (n <= 10 || c >= 10) console.log(`  ${n.toString().padStart(3)} matches: ${c} APIs`);
  }

  // Show some sample matches for sanity check
  const samples = await prisma.sapApiReference.findMany({
    where: { NOT: { scopeItemCodes: { isEmpty: true } } },
    select: { apiId: true, apiName: true, scopeItemCodes: true },
    take: 8,
    orderBy: { apiId: "asc" },
  });
  console.log("\n=== Sample matched APIs (first 8 alphabetical) ===");
  for (const s of samples) {
    console.log(`  ${s.apiId.padEnd(40)} ${s.apiName.slice(0, 40).padEnd(42)} → [${s.scopeItemCodes.slice(0, 5).join(",")}${s.scopeItemCodes.length > 5 ? `+${s.scopeItemCodes.length - 5}` : ""}]`);
  }

  // Final coverage stat
  const apisWithScopes = await prisma.sapApiReference.count({
    where: { NOT: { scopeItemCodes: { isEmpty: true } } },
  });
  const total = await prisma.sapApiReference.count();
  console.log(`\nFinal coverage: ${apisWithScopes} / ${total} APIs have ≥1 scopeItemCode (${((apisWithScopes / total) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
