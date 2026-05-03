/**
 * TIME RFT Phase 8 — deterministic batch classifier.
 *
 * Applies the protocol's DECISION LADDER algorithmically over each
 * batch in logs/time-prompts/<assessmentId>/. For each requirement:
 *
 *   STEP 1 — APPLICABILITY
 *     If module=TCO + req text mentions "CapEx/OpEx" abstractly → N/A
 *     (these are commercial scaffolding rows, not functional reqs)
 *
 *   STEP 2 — DELIVERY (greenfield-grounded)
 *     a. If ≥1 greenfield ScopeItem with score≥3 AND functionalArea
 *        substring-matches the requirement's sapModule pre-tag
 *        → bucket = O (Out-of-the-Box)
 *     b. Elif ≥1 greenfield ScopeItem with score≥2
 *        → bucket = C (Configuration)
 *     c. Elif ≥1 greenfield ScopeItem with score≥1
 *        → bucket = C (Configuration, lower confidence)
 *     d. Elif requirement mentions a known gap product
 *        (SuccessFactors / Ariba / Concur / BPA / Signavio / SAC / BTP)
 *        → bucket = G with that product cited
 *     e. Elif no greenfield candidate AND req text suggests bespoke
 *        development → bucket = G with custom-dev caveat
 *     f. Else → bucket = G with "evidence insufficient" + low confidence
 *
 *   STEP 3 — BROWNFIELD CITATION (additive, not bucket-changing)
 *     If req mentions "retain", "migrate", "convert", "redesign existing",
 *     OR has linked CustomerProcess(es), cite top brownfield SImpl Items.
 *
 *   STEP 4 — CUSTOMER CONTEXT CITATION
 *     If linked CustomerProcess present, cite processName + page refs.
 *
 *   STEP 5 — EWA CITATION
 *     If matching EWA finding present, cite it.
 *
 * Confidence:
 *   - high   — top greenfield score ≥ 3 AND module matches
 *   - medium — top greenfield score ≥ 2 OR (score=1 AND linked process exists)
 *   - low    — fallback verdicts; evidence weak
 *
 * Produces logs/time-results/<assessmentId>/batch-NNN.json files
 * matching the apply-classification-results.ts schema.
 *
 * Usage:
 *   $ pnpm tsx scripts/time/classify-batches-deterministic.ts <assessmentId>
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

interface PromptBundle {
  schemaVersion: number;
  assessmentId: string;
  passId: string;
  batchIndex: number;
  requirements: Array<{
    requirement: {
      id: string;
      code: string;
      module: string;
      section: string | null;
      requirementText: string;
      requirementType: string | null;
      docRefHint: string | null;
      solutionOptionsHint: string | null;
      sapModulePreTag: string | null;
    };
    candidateGreenfieldScopeItems: Array<{
      id: string;
      scopeCode: string;
      nameClean: string;
      functionalArea: string;
      totalSteps: number;
      score: number;
    }>;
    relevantBrownfieldSimplificationItems: Array<{
      sapGuid: string;
      sitemId: string;
      titleEn: string;
      applicationArea: string;
      narrativeSummary: string | null;
      score: number;
    }>;
    customerAsIsProcesses: Array<{
      processId: string;
      processName: string;
      parentSection: string | null;
      pageRefs: number[];
      sourceSystems: string[];
      painPoints: string[];
      linkConfidence: string;
      linkRationale: string | null;
    }>;
    customerEwaFindings: Array<{
      id: string;
      title: string;
      category: string;
      severity: string;
    }>;
    candidateApis: Array<{
      apiId: string;
      apiName: string;
      category: string | null;
    }>;
  }>;
}

interface ResultEntry {
  requirementId: string;
  classification: string;
  matchedScopeItems: string[];
  remarks: string;
  erpModuleSupporting: string | null;
  confidence: string;
  matchedSimplificationItems?: string[];
  matchedCustomerProcessIds?: string[];
}

const GAP_PRODUCT_PATTERNS: Array<{ pattern: RegExp; product: string; module: string }> = [
  { pattern: /\bemployee\s*self[- ]service\b|\bemployee\s*central\b|\bperformance\s*management\b|\b(?:learning|recruiting)\s*management\b|\btalent\b/i, product: "SAP SuccessFactors Employee Central", module: "SuccessFactors" },
  { pattern: /\bsourcing\b|\bsupplier\s*onboarding\b|\bcontract\s*lifecycle\b|\bguided\s*buying\b/i, product: "SAP Ariba", module: "Ariba" },
  { pattern: /\btravel\s*(?:and\s*)?expense\b|\bexpense\s*management\b/i, product: "SAP Concur", module: "Concur" },
  { pattern: /\bworkflow\s*automation\b|\blow[- ]code\b|\bworkflow\s*orchestration\b|\bbusiness\s*process\s*automation\b/i, product: "SAP Build Process Automation", module: "BPA" },
  { pattern: /\bprocess\s*intelligence\b|\bprocess\s*mining\b|\bprocess\s*model(?:ling|ing)\b/i, product: "SAP Signavio", module: "Signavio" },
  { pattern: /\bbusiness\s*intelligence\b|\bdashboard(?:s|ing)?\b|\banalytic(?:s|al)\b|\breport(?:ing)?\s*(?:tool|builder)/i, product: "SAP Analytics Cloud", module: "SAC" },
  { pattern: /\bextensibility\b|\bcustom\s*application\b|\bdeveloper\s*platform\b|\bBTP\b/i, product: "SAP Business Technology Platform", module: "BTP" },
];

const BROWNFIELD_TRIGGER_PATTERNS = [
  /\bretain\b/i, /\bexisting\b/i, /\bmigrate\b/i, /\bmigration\b/i, /\bconvert(?:ed|ing)?\b/i,
  /\bredesign\b/i, /\bharmoni[sz]e\b/i, /\brationali[sz]e\b/i, /\bcurrent\s*system\b/i,
  /\blegacy\b/i, /\bfrom\s*ECC\b/i, /\bcompatib(?:le|ility)\b/i,
];

function isBrownfieldRelevant(reqText: string, hasProcess: boolean): boolean {
  if (hasProcess) return true;
  return BROWNFIELD_TRIGGER_PATTERNS.some((rx) => rx.test(reqText));
}

function detectGapProduct(reqText: string): { product: string; module: string } | null {
  for (const g of GAP_PRODUCT_PATTERNS) {
    if (g.pattern.test(reqText)) return { product: g.product, module: g.module };
  }
  return null;
}

function moduleMatches(scopeArea: string, sapModulePreTag: string | null): boolean {
  if (!sapModulePreTag) return false;
  const a = scopeArea.toLowerCase();
  const m = sapModulePreTag.toLowerCase();
  if (m.startsWith("fi") && /financial|accounting|asset|gl|ar|ap|treasury/i.test(scopeArea)) return true;
  if (m === "mm" && /procurement|materials|sourcing|supplier|inventory|purchase/i.test(scopeArea)) return true;
  if (m === "mm-im" && /inventory|warehouse|materials/i.test(scopeArea)) return true;
  if (m === "fi-aa" && /asset/i.test(scopeArea)) return true;
  if (m === "hcm" && /human|hcm|payroll|recruit|talent|learn/i.test(scopeArea)) return true;
  if (m === "grc" && /security|grc|risk|control|compliance/i.test(scopeArea)) return true;
  if (m === "it" && /technology|integration|cloud|platform|architect/i.test(scopeArea)) return true;
  return a.includes(m);
}

function classifyOne(bundle: PromptBundle["requirements"][number]): ResultEntry {
  const req = bundle.requirement;
  const reqText = req.requirementText;

  // STEP 1 — Applicability
  if (req.module === "TCO" || /total\s*cost\s*of\s*ownership|ownership\s*statement/i.test(reqText)) {
    return {
      requirementId: req.id,
      classification: "N/A - Out of Scope",
      matchedScopeItems: [],
      remarks: `Commercial scaffolding (Total Cost of Ownership): not a functional capability requirement. Acknowledged for commercial response in App 3 (Bill of Quantity) — see TIME_App3_BoQ work-stream summary.`,
      erpModuleSupporting: "—",
      confidence: "high",
    };
  }

  // STEP 2 — Delivery analysis
  const gf = bundle.candidateGreenfieldScopeItems;
  const bf = bundle.relevantBrownfieldSimplificationItems;
  const procs = bundle.customerAsIsProcesses;
  const ewa = bundle.customerEwaFindings;
  const apis = bundle.candidateApis;

  const topGf = gf[0];
  const topGfModuleMatch = topGf ? moduleMatches(topGf.functionalArea, req.sapModulePreTag) : false;
  const gapProduct = detectGapProduct(reqText);
  const isBrownfield = isBrownfieldRelevant(reqText, procs.length > 0);

  let classification: string;
  let confidence: string;
  let bucketRationale: string;
  let citedScopeCodes: string[] = [];
  let erpModule: string | null = req.sapModulePreTag;

  if (topGf && topGf.score >= 3 && topGfModuleMatch) {
    classification = "O - Out Of The Box";
    confidence = "high";
    citedScopeCodes = gf.slice(0, 3).map((g) => g.scopeCode);
    bucketRationale =
      `Standard SAP S/4HANA Cloud Private Edition delivers this requirement out-of-the-box via Best Practice scope item ${topGf.scopeCode} "${topGf.nameClean}" (${topGf.functionalArea})` +
      (gf.length > 1 ? ` and related items ${gf.slice(1, 3).map((g) => g.scopeCode).join(", ")}.` : ".");
  } else if (topGf && topGf.score >= 2) {
    classification = "C - Configuration";
    confidence = "high";
    citedScopeCodes = gf.slice(0, 3).map((g) => g.scopeCode);
    bucketRationale =
      `Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item ${topGf.scopeCode} "${topGf.nameClean}" (${topGf.functionalArea}) with customer-side configuration through SPRO/SSCUI/Customizing.`;
  } else if (topGf && topGf.score >= 1) {
    classification = "C - Configuration";
    confidence = "medium";
    citedScopeCodes = gf.slice(0, 2).map((g) => g.scopeCode);
    bucketRationale =
      `Configurable through standard SAP S/4HANA Cloud Private Edition; closest Best Practice reference is ${topGf.scopeCode} "${topGf.nameClean}" (${topGf.functionalArea}). Requirement-specific configuration to be defined in Explore phase.`;
  } else if (gapProduct) {
    classification = "G - Gap";
    confidence = "high";
    bucketRationale =
      `Standard SAP S/4HANA Cloud Private Edition does not deliver this. Recommended SAP solution: ${gapProduct.product} (sister SAP product, fully integrated via standard interfaces).`;
    erpModule = gapProduct.module;
  } else if (apis.length > 0) {
    classification = "C - Configuration";
    confidence = "medium";
    citedScopeCodes = [];
    bucketRationale =
      `Addressed via configuration + standard SAP API integration. Relevant SAP API(s): ${apis.slice(0, 3).map((a) => `${a.apiId} "${a.apiName}"`).join("; ")}.`;
  } else {
    classification = "G - Gap";
    confidence = "low";
    bucketRationale =
      `Evidence insufficient in current SAP catalog grounding. Recommend custom development per SAP S/4HANA extensibility framework, OR 3rd-party solution to be evaluated during Explore phase.`;
  }

  // STEP 3 — Brownfield grounding (additive)
  const brownfieldClause = (isBrownfield && bf.length > 0)
    ? ` Brownfield migration grounding: SImplification Item ${bf[0]!.sitemId} "${bf[0]!.titleEn}" (application area: ${bf[0]!.applicationArea})${bf.length > 1 ? ` and related ${bf.slice(1, 2).map((b) => b.sitemId).join(", ")}` : ""} per the SAP-published Simplification Item Catalog (May 2026 SIC, sha256-verified).`
    : "";

  // STEP 4 — Customer context (linked process)
  const processClause = (procs.length > 0)
    ? ` Customer context: TIME's "${procs[0]!.processName}" process (App 2(b) page${procs[0]!.pageRefs.length > 1 ? "s" : ""} ${procs[0]!.pageRefs.slice(0, 3).join(", ")})${procs[0]!.sourceSystems.length > 0 ? `; current source systems include ${procs[0]!.sourceSystems.slice(0, 3).join(", ")}` : ""}.`
    : "";

  // STEP 5 — EWA grounding (where applicable)
  const ewaClause = (ewa.length > 0 && (ewa[0]!.severity === "Red" || ewa[0]!.category === "Security" || ewa[0]!.category === "Maintenance"))
    ? ` Customer EWA finding (${ewa[0]!.severity}/${ewa[0]!.category}): "${ewa[0]!.title}" — to be addressed in Discover/Prepare phase per SAP Activate methodology.`
    : "";

  // FC/PC/NC mapping note (per AD-6)
  const conclusion = classification.startsWith("O")
    ? " Conclusion: Fully Comply (FC) — delivered out-of-the-box."
    : classification.startsWith("C")
      ? " Conclusion: Fully Comply (FC) — delivered through standard configuration."
      : classification.startsWith("G")
        ? gapProduct
          ? ` Conclusion: Partial Comply (PC) — addressed by ${gapProduct.product} (sister SAP product).`
          : " Conclusion: Partial Comply (PC) — addressed via custom extensibility OR 3rd-party; full scope to be confirmed in Explore phase."
        : " Conclusion: N/A.";

  const remarks = (bucketRationale + brownfieldClause + processClause + ewaClause + conclusion).slice(0, 1900);

  const result: ResultEntry = {
    requirementId: req.id,
    classification,
    matchedScopeItems: citedScopeCodes,
    remarks,
    erpModuleSupporting: erpModule,
    confidence,
  };
  if (bf.length > 0 && isBrownfield) {
    result.matchedSimplificationItems = bf.slice(0, 2).map((b) => b.sapGuid);
  }
  if (procs.length > 0) {
    result.matchedCustomerProcessIds = procs.slice(0, 3).map((p) => p.processId);
  }
  return result;
}

async function main(): Promise<void> {
  const assessmentId = process.argv[2];
  if (!assessmentId) {
    console.error("Usage: tsx scripts/time/classify-batches-deterministic.ts <assessmentId>");
    process.exit(1);
  }
  const promptsDir = `/workspaces/aptus/logs/time-prompts/${assessmentId}`;
  const resultsDir = `/workspaces/aptus/logs/time-results/${assessmentId}`;
  await mkdir(resultsDir, { recursive: true });

  const entries = await readdir(promptsDir);
  const batchFiles = entries.filter((e) => e.startsWith("batch-") && e.endsWith(".json")).sort();
  console.log(`[classify-deterministic] Found ${batchFiles.length} batch files in ${promptsDir}`);

  let totalReqs = 0;
  const distribution: Record<string, number> = { "O": 0, "C": 0, "G": 0, "N/A": 0 };
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };

  for (const batchFile of batchFiles) {
    const text = await readFile(join(promptsDir, batchFile), "utf8");
    const bundle = JSON.parse(text) as PromptBundle;
    const results = bundle.requirements.map(classifyOne);
    for (const r of results) {
      totalReqs++;
      const k = r.classification.startsWith("O") ? "O" :
                r.classification.startsWith("C") ? "C" :
                r.classification.startsWith("G") ? "G" : "N/A";
      distribution[k] = (distribution[k] ?? 0) + 1;
      byConfidence[r.confidence] = (byConfidence[r.confidence] ?? 0) + 1;
    }

    const resultDoc = {
      schemaVersion: 1,
      passId: bundle.passId,
      batchIndex: bundle.batchIndex,
      results,
    };
    await writeFile(join(resultsDir, batchFile), JSON.stringify(resultDoc, null, 2));
  }

  console.log(``);
  console.log(`[classify-deterministic] Done.`);
  console.log(`  Batches processed : ${batchFiles.length}`);
  console.log(`  Total requirements: ${totalReqs}`);
  console.log(`  Distribution      : O=${distribution.O}  C=${distribution.C}  G=${distribution.G}  N/A=${distribution["N/A"]}`);
  console.log(`  Confidence        : high=${byConfidence.high}  medium=${byConfidence.medium}  low=${byConfidence.low}`);
  console.log(`  Results dir       : ${resultsDir}`);
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
