/**
 * Heuristic backfill v2 — SAP domain keyword expansion.
 *
 * v1 (substring match against scope-item nameClean) gave only 5.2% coverage
 * because SAP APIs name OBJECTS ("Business Partner") while scope items name
 * PROCESSES ("Accounts Payable"). v2 adds a hand-curated keyword expansion
 * layer mapping common SAP object/feature words to scope-item codes.
 *
 * Coverage target: 50-70%. Trade-off: some false positives expected on the
 * very generic mappings (Customer / Supplier / Material) — these get high
 * volume but lower precision. The classifier still gates on edition + status
 * so wrong APIs surface as evidence won't break anything; they'll just be
 * weaker grounding.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Hand-curated SAP-object/term keyword → scope-item-code mapping.
 *
 * For each entry, when the regex matches the API's apiName + description
 * (case-insensitive, word-boundary), the scope codes get added.
 *
 * Sources for the mappings: SAP S/4HANA Cloud Best Practices Explorer,
 * SAP Help Portal scope-item docs. Codes are validated against the live
 * catalog at script start (any unknown codes are warned + ignored).
 */
const KEYWORD_MAP: Array<{ pattern: RegExp; codes: string[]; label: string }> = [
  // ── Finance: Receivables / Payables ────────────────────────────────────
  { pattern: /\b(accounts? receivable|customer (master|invoice)|sales (invoice|billing))\b/i, codes: ["J59"], label: "AR" },
  { pattern: /\b(accounts? payable|supplier invoice|vendor (master|invoice|payment))\b/i, codes: ["J60"], label: "AP" },
  { pattern: /\b(business partner|busin?ess?partner)\b/i, codes: ["J59", "J60"], label: "BP master" },
  { pattern: /\b(customer\b(?! returns?))/i, codes: ["J59"], label: "Customer" },
  { pattern: /\b(supplier|vendor)\b/i, codes: ["J60"], label: "Supplier/Vendor" },
  { pattern: /\b(payment (run|method|terms)|outgoing payment|incoming payment)\b/i, codes: ["J60", "J59"], label: "Payment" },
  { pattern: /\b(dunning|collection)\b/i, codes: ["BFC", "J59"], label: "Dunning/Collections" },
  { pattern: /\b(credit (memo|management|limit)|debit memo)\b/i, codes: ["1EZ", "1F1", "BD6"], label: "Credit/Debit memo" },

  // ── Finance: GL / Cost Accounting / Reporting ───────────────────────────
  { pattern: /\b(journal entry|general ledger|gl (account|posting))\b/i, codes: ["1QM", "J58"], label: "GL" },
  { pattern: /\b(cost center|profit center|internal order)\b/i, codes: ["J54", "BEG", "BEV"], label: "Cost objects" },
  { pattern: /\b(asset accounting|fixed asset|asset under construction|depreciation)\b/i, codes: ["BFH", "1GB", "1GF", "2QY"], label: "Asset accounting" },
  { pattern: /\b(group reporting|consolidation|intercompany reconciliation)\b/i, codes: ["1GA", "40Y", "28B"], label: "Consolidation" },
  { pattern: /\b(chart of accounts|coa)\b/i, codes: ["J58"], label: "COA" },

  // ── Finance: Treasury / Cash / Bank ────────────────────────────────────
  { pattern: /\b(bank (statement|account|fee)|cash (management|application|journal)|treasury)\b/i, codes: ["BFA", "J77", "16R", "4X8", "1EG", "1MV", "1GO", "BFB"], label: "Treasury/Bank" },
  { pattern: /\b(direct debit|sepa)\b/i, codes: ["19M"], label: "Direct debit" },

  // ── Finance: Tax ────────────────────────────────────────────────────────
  { pattern: /\b(tax (calculation|reporting|determination|code)|withholding tax|wht|sst|gst|vat|excise)\b/i, codes: ["1J2", "5XU", "4LO"], label: "Tax" },

  // ── Sourcing & Procurement ─────────────────────────────────────────────
  { pattern: /\b(purchase order|po (item|header)|purchasing)\b/i, codes: ["18J", "BMD", "J45"], label: "Purchase Order" },
  { pattern: /\b(purchase (requisition|contract)|requisitioning)\b/i, codes: ["18J", "BMD", "1XI"], label: "Purchase Req/Contract" },
  { pattern: /\b(central (procurement|purchase|sourcing|requisitioning))\b/i, codes: ["2XT", "2ME", "3ZF", "1XI", "4B0"], label: "Central Procurement" },
  { pattern: /\b(rfq|request for quotation|bidding)\b/i, codes: ["1XF"], label: "RFQ/Sourcing" },
  { pattern: /\b(supplier quotation|supplier (selection|invoice list))\b/i, codes: ["1XF", "J60"], label: "Supplier interaction" },
  { pattern: /\b(scheduling agreement|contract management|outline agreement)\b/i, codes: ["I9I", "BMD", "4AZ"], label: "Contract" },
  { pattern: /\b(goods receipt|inbound delivery|gr\/ir)\b/i, codes: ["2V7", "1FS", "2TX"], label: "Goods Receipt" },

  // ── Sales / Order-to-Cash ──────────────────────────────────────────────
  { pattern: /\b(sales order|sales contract|sales quotation|sales scheduling)\b/i, codes: ["BKK", "BD9", "BDG", "1IQ", "I9I"], label: "Sales" },
  { pattern: /\b(billing document|outbound invoice|invoice list)\b/i, codes: ["BKZ", "1Z6"], label: "Billing" },
  { pattern: /\b(delivery (document|order)|outbound delivery|shipping notification)\b/i, codes: ["1MI", "1G2", "1V7", "1VD"], label: "Delivery" },
  { pattern: /\b(customer return|return order|sales return|return delivery)\b/i, codes: ["BKP", "BDD", "1Z3", "3TE", "5CX"], label: "Customer Returns" },
  { pattern: /\b(pricing|condition record|sales (rebate|condition))\b/i, codes: ["34B", "1B6"], label: "Pricing/Rebate" },

  // ── Manufacturing / Production ─────────────────────────────────────────
  { pattern: /\b(production order|process order|manufacturing order|work center)\b/i, codes: ["BJK", "3OK", "3LO"], label: "Production order" },
  { pattern: /\b(bill of material(?:s)?|bom|recipe)\b/i, codes: ["1NR", "3LO", "3LP", "1QG", "1QC", "1QA"], label: "BOM/Recipe" },
  { pattern: /\b(make-to-(order|stock)|mts|mto)\b/i, codes: ["3OK", "3UL", "3L7", "1YT", "4OC"], label: "MTO/MTS" },
  { pattern: /\b(material requirements? planning|mrp|capacity (planning|leveling))\b/i, codes: ["4B5", "3LQ"], label: "MRP" },
  { pattern: /\b(kanban|replenishment)\b/i, codes: ["1E3", "4B3", "4B4"], label: "Kanban" },
  { pattern: /\b(quality (management|inspection|notification|complaint))\b/i, codes: ["1E1", "2F9", "2FA", "2QP", "2V0"], label: "Quality" },
  { pattern: /\b(co-?product|by-?product|silo)\b/i, codes: ["3L7", "3UL"], label: "Co-/By-product" },

  // ── Supply Chain / Warehouse / Inventory ───────────────────────────────
  { pattern: /\b(warehouse (order|task|inbound|outbound|management)|wm\b)\b/i, codes: ["1FS", "1G2", "1FU", "1FW", "1FY", "1G0", "1V5", "1V7", "1V9", "1VB", "1VD", "BGG"], label: "Warehouse" },
  { pattern: /\b(inventory (management|count)|physical inventory|stock transfer|stock posting)\b/i, codes: ["4LU", "BML"], label: "Inventory" },
  { pattern: /\b(handling unit)\b/i, codes: ["4MM"], label: "Handling unit" },
  { pattern: /\b(serial number)\b/i, codes: ["BLL"], label: "Serial Number" },
  { pattern: /\b(available[- ]to[- ]promise|atp)\b/i, codes: ["6LJ", "1JW"], label: "ATP" },
  { pattern: /\b(demand (planning|management|driven))\b/i, codes: ["1Y2"], label: "Demand Planning" },
  { pattern: /\b(supply chain automation|business network)\b/i, codes: ["5I2", "4A1", "5JT", "42K", "J82", "4AZ", "4B0", "7YH"], label: "Business Network" },

  // ── Service / Asset Management ─────────────────────────────────────────
  { pattern: /\b(maintenance (order|notification|request)|reactive maintenance|proactive maintenance|plant maintenance|pm\b)\b/i, codes: ["4HH", "4HI", "BF7"], label: "Maintenance" },
  { pattern: /\b(service (order|entry sheet|monitoring))\b/i, codes: ["43B", "63L"], label: "Service order" },
  { pattern: /\b(asset intelligence)\b/i, codes: ["2WK"], label: "Asset Intelligence Network" },

  // ── Project Accounting / Project System ────────────────────────────────
  { pattern: /\b(project (accounting|management|wbs)|professional services? project)\b/i, codes: ["BEI"], label: "Project accounting" },
  { pattern: /\b(commercial project)\b/i, codes: [], label: "Commercial Project (no clear scope match)" },

  // ── Real Estate / Lease ────────────────────────────────────────────────
  { pattern: /\b(real estate|lease|sales-based rent|rent contract)\b/i, codes: ["3F4", "21P", "2SA"], label: "RE-FX" },

  // ── Cross Topics — Compliance / Trade / Risk ──────────────────────────
  { pattern: /\b(global trade|gts|customs|trade compliance|preference management|embargo|legal control)\b/i, codes: ["1WA", "24F", "24H", "2U3", "2U1", "24J", "3JX", "1W8", "1WC"], label: "GTS" },
  { pattern: /\b(risk (management|monitoring)|control monitoring|process control)\b/i, codes: ["2U2", "3KX", "3KY", "2OH"], label: "GRC" },
  { pattern: /\b(document (compliance|reporting compliance)|reporting compliance|drc)\b/i, codes: ["5XU"], label: "DRC" },
  { pattern: /\b(situation (handling|template|type))\b/i, codes: ["31N"], label: "Situation Handling" },
  { pattern: /\b(safety data sheet|sds|chemical compliance|ehs)\b/i, codes: ["3VQ", "3VR", "31J"], label: "EHS" },

  // ── Master Data / Migration / Integration ──────────────────────────────
  { pattern: /\b(data migration|migration cockpit|staging table)\b/i, codes: ["2Q2"], label: "Data migration" },
  { pattern: /\b(master data (replication|integration|maintenance))\b/i, codes: ["1FD", "1WA"], label: "Master Data" },
  { pattern: /\b(employee (master|integration)|workforce|personnel)\b/i, codes: ["1FD"], label: "Employee" },

  // ── Convergent / Contract Accounting ────────────────────────────────────
  { pattern: /\b(convergent (invoicing|contract|charging)|fi-ca|contract accounting)\b/i, codes: ["1MC", "2KF", "2KH", "2UJ"], label: "FI-CA" },

  // ── Predictive / ML / AI ────────────────────────────────────────────────
  { pattern: /\b(predictive (analytics|model)|machine learning|intelligent scenario|prediction of delivery)\b/i, codes: ["20N", "2YJ", "1QR", "2ZS", "3FY"], label: "Predictive" },

  // ── Approvals / Workflow ────────────────────────────────────────────────
  { pattern: /\b(workflow|approval (process|workflow))\b/i, codes: ["31N"], label: "Workflow" },
];

interface ApiRow {
  id: string;
  apiId: string;
  apiName: string;
  description: string;
}

async function main(): Promise<void> {
  // Validate that every code in KEYWORD_MAP exists in the catalog
  const allCodes = new Set(
    (await prisma.scopeItem.findMany({ select: { scopeCode: true } })).map((s) => s.scopeCode),
  );
  let unknownCount = 0;
  for (const entry of KEYWORD_MAP) {
    for (const code of entry.codes) {
      if (!allCodes.has(code)) {
        console.warn(`  ⚠️  Unknown scope code "${code}" referenced by keyword [${entry.label}]`);
        unknownCount++;
      }
    }
  }
  if (unknownCount > 0) {
    console.log(`(${unknownCount} unknown codes will be silently dropped from matches)`);
  }
  console.log(`Keyword map: ${KEYWORD_MAP.length} keyword patterns`);

  // Also keep the v1 substring match against scope-item nameClean (still valuable for direct hits)
  const nameMatchers = (
    await prisma.scopeItem.findMany({ select: { scopeCode: true, nameClean: true } })
  )
    .map((s) => ({ ...s, nameClean: s.nameClean.trim() }))
    .filter((s) => s.nameClean.length >= 8)
    .map((s) => ({
      scopeCode: s.scopeCode,
      regex: new RegExp(`\\b${s.nameClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    }));
  console.log(`Direct-name matchers: ${nameMatchers.length}`);

  const apis: ApiRow[] = await prisma.sapApiReference.findMany({
    select: { id: true, apiId: true, apiName: true, description: true },
  });
  console.log(`APIs to scan: ${apis.length}`);

  let updated = 0;
  let totalMatches = 0;
  let apisWithMatches = 0;
  let maxPerApi = 0;
  const histogram = new Map<number, number>();

  for (const api of apis) {
    const haystack = `${api.apiName} ${api.description}`;
    const codes = new Set<string>();

    // v1: direct name substring match
    for (const m of nameMatchers) {
      if (m.regex.test(haystack)) codes.add(m.scopeCode);
    }
    // v2: keyword expansion
    for (const entry of KEYWORD_MAP) {
      if (entry.pattern.test(haystack)) {
        for (const c of entry.codes) {
          if (allCodes.has(c)) codes.add(c);
        }
      }
    }

    const arr = Array.from(codes).sort().slice(0, 24); // cap at 24 codes per API

    if (arr.length > 0) {
      apisWithMatches++;
      totalMatches += arr.length;
      maxPerApi = Math.max(maxPerApi, arr.length);
    }
    histogram.set(arr.length, (histogram.get(arr.length) ?? 0) + 1);

    await prisma.sapApiReference.update({
      where: { id: api.id },
      data: { scopeItemCodes: arr },
    });
    updated++;
    if (updated % 250 === 0) console.log(`  ... ${updated}/${apis.length}`);
  }

  console.log("\n=== Coverage ===");
  console.log(`  APIs with ≥1 match: ${apisWithMatches} / ${apis.length} (${((apisWithMatches / apis.length) * 100).toFixed(1)}%)`);
  console.log(`  Total scope-code links: ${totalMatches}`);
  console.log(`  Avg matches per matched API: ${(totalMatches / Math.max(1, apisWithMatches)).toFixed(1)}`);
  console.log(`  Max codes in one API: ${maxPerApi}`);

  console.log("\n=== Match-count histogram ===");
  const hist = Array.from(histogram.entries()).sort((a, b) => a[0] - b[0]);
  for (const [n, c] of hist) {
    if (n <= 10 || c >= 5) console.log(`  ${n.toString().padStart(3)} matches: ${c} APIs`);
  }

  // Sample diverse matches
  console.log("\n=== Diverse sample matches (12 random) ===");
  const samples = await prisma.sapApiReference.findMany({
    where: { NOT: { scopeItemCodes: { isEmpty: true } } },
    select: { apiId: true, apiName: true, scopeItemCodes: true },
    take: 12,
    orderBy: { apiId: "desc" },
  });
  for (const s of samples) {
    console.log(`  ${s.apiId.slice(0, 42).padEnd(44)} ${s.apiName.slice(0, 36).padEnd(38)} → [${s.scopeItemCodes.slice(0, 6).join(",")}${s.scopeItemCodes.length > 6 ? `+${s.scopeItemCodes.length - 6}` : ""}]`);
  }

  // Edition-specific check: how many APIs visible to each edition NOW have scope codes?
  const pubWithCodes = await prisma.sapApiReference.count({
    where: { appliesToPublic: true, NOT: { scopeItemCodes: { isEmpty: true } } },
  });
  const pubTotal = await prisma.sapApiReference.count({ where: { appliesToPublic: true } });
  const privWithCodes = await prisma.sapApiReference.count({
    where: { appliesToPrivate: true, NOT: { scopeItemCodes: { isEmpty: true } } },
  });
  const privTotal = await prisma.sapApiReference.count({ where: { appliesToPrivate: true } });
  console.log(`\n=== Coverage by edition (Released only) ===`);
  console.log(`  Public:  ${pubWithCodes} / ${pubTotal} (${((pubWithCodes / pubTotal) * 100).toFixed(1)}%)`);
  console.log(`  Private: ${privWithCodes} / ${privTotal} (${((privWithCodes / privTotal) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
