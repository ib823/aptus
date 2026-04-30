/**
 * Gap 1 (Path B) — author + seed the REAL Private 2025-FPS1 classification
 * protocol, drafted from:
 *   - The Private foundation requirements PDF
 *     (BP_OP_ENTPR_2025-FPS1_Requirements_EN_XX.pdf, ingested as SetupGuide)
 *   - SAP S/4HANA Cloud Private Edition's documented extensibility envelope
 *     (BAdIs, classic in-app config exposed via SPRO, in-app extensions,
 *      source-code extensions / native ABAP)
 *   - SAP Activate Methodology for RISE (publicly documented bucket guidance)
 *   - Malaysian localization scope (SST, e-Invoicing peppol, EPF/SOCSO,
 *      SAP Note 3642516 referenced from the catalog)
 *
 * Saves as a NEW ClassificationProtocol row alongside the placeholder.
 * Does NOT activate (isActive=false). User reviews + authorizes activation
 * separately after the validation gauntlet runs.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Bucket definitions ─────────────────────────────────────────────────────
// Private's bucket rules differ from Public in the C / G threshold: Private
// exposes classic config + BAdIs + source-code extensions, so many things
// that are G in Public become C in Private. O and N/A are essentially the
// same except scope item codes belong to the Private 2025-FPS1 catalog.
const BUCKET_DEFINITIONS = {
  "O - Out Of The Box":
    "capability is in the Private 2025-FPS1 baseline as-is, no customization needed; cited Private scope items deliver it via standard SAP best-practice configuration",
  "C - Configuration":
    "capability is met within Private Edition's extensibility envelope: SSCUI / classic in-app config (SPRO) / Key User Extensibility / In-App Extensions (custom fields, custom logic) / BAdI implementation / Source-code extensions (custom ABAP on customer tenant) / Manage Workflows / Output Management / Adapt UI / Adobe Forms / Communication Arrangement / In-App Side-by-Side via BTP",
  "G - Gap":
    "requires a separate licensed SAP product (SuccessFactors EC + talent suite, Ariba, SAC Planning, SAC Smart Predict, SAP Commerce Cloud, FieldGlass, SAP Concur for travel, SAP IBP for advanced supply chain planning, etc.) OR a 3rd-party tool (Vertex / ONESOURCE for corporate tax, Avalara, Adobe Sign, DocuSign, etc.) — these are NOT in the Private 2025-FPS1 baseline even with full extensibility",
  "N/A - Out of Scope":
    "not a SAP capability question (vendor commercial pre-qualification, ESG offerings, vendor track record, contractual policy, security policy that is the cloud provider's responsibility, hardware/infrastructure procurement decisions, etc.)",
};

// ── Grounding rules ────────────────────────────────────────────────────────
const GROUNDING_RULES = `Reference scope items by ID + name (e.g. "J60 Accounts Payable")
Be brutally honest about Gaps — do NOT invent OOTB coverage that is not in the candidate list
For Configuration, name the SPECIFIC mechanism (SSCUI / Key User Extensibility / classic SPRO config / BAdI / In-App Extension / Source-code extension / Adapt UI / Manage Workflows / Output Management / Adobe Forms / Communication Arrangement / BTP Side-by-Side)
For Gap, explicitly name the separate SAP product OR 3rd-party tool needed; note any partial workaround within Private 2025-FPS1
"matchedScopeItems" should be the top 1-3 Private 2025-FPS1 scope item IDs + names from the candidate list that cover this requirement; empty if none (then it is a Gap or N/A by definition)
For Malaysian-localization-tagged requirements (e-Invoicing / Peppol, SST / GST transition, EPF/SOCSO, Bank Negara reporting, IRBM compliance), explicitly name the localization mechanism (SAP Note 3642516, scope item code, or third-party Malaysian connector) and never assume generic SAP coverage extends to MY locale
Confidence calibration: "high" = cited scope items directly cover the requirement and the configuration mechanism is documented in standard SAP guidance; "medium" = scope items partly cover or extension is well-precedented but customer-specific; "low" = cited scope items only loosely match or the extension path is plausible but unverified`;

// ── System prompt — full text sent to Claude ───────────────────────────────
const SYSTEM_PROMPT = `You are a SAP S/4HANA Cloud Private Edition fit-to-standard analyst working with the Private 2025-FPS1 catalog.

Your job: classify each requirement in this batch against the candidate Private 2025-FPS1 scope items, then produce a grounded narrative.

# EDITION CONTEXT — PRIVATE EDITION 2025-FPS1
Unlike Public Edition, Private Edition exposes a substantially richer extensibility envelope:
- Classic in-app configuration (SPRO transactions exposed; not just the curated SSCUI subset)
- Key User Extensibility (custom fields, custom logic, In-App Extension framework)
- BAdIs (Business Add-Ins) — extension points for custom logic without forking core SAP code
- Source-code extensions (custom ABAP) on the customer tenant
- Native ABAP development for genuinely bespoke requirements
- Broader FIORI app modifications via UI Adaptation / WebIDE / SAP Build Apps
- Side-by-side extensions via SAP BTP (CAP / RAP services), federated via Communication Arrangement

This means many requirements that are GAP on Public Edition become CONFIGURE on Private Edition because the necessary extensibility is available natively. Be careful NOT to over-call gaps — if BAdI / classic config / source extension can plausibly meet the requirement, classify as C and explicitly tag the extension type in remarks.

# CLASSIFICATION RULES (use exact strings)
- "O - Out Of The Box"   — capability is in the Private 2025-FPS1 baseline as-is, no customization needed
- "C - Configuration"    — capability is met within Private's extensibility envelope (SSCUI / classic SPRO config / Key User Extensibility / In-App Extension / BAdI / Source-code extension / Adapt UI / Manage Workflows / Output Management / Adobe Forms / Communication Arrangement / BTP Side-by-Side)
- "G - Gap"              — requires a separate licensed SAP product (SuccessFactors EC, Ariba, SAC Planning, SAC Smart Predict, SAP Commerce Cloud, FieldGlass, Concur, IBP, etc.) OR a 3rd-party tool (Vertex / ONESOURCE for corporate tax, Avalara, Adobe Sign, DocuSign, etc.) — NOT in the Private 2025-FPS1 baseline even with full extensibility
- "N/A - Out of Scope"   — not a SAP capability question (vendor commercial pre-qualification, ESG offerings, vendor track record, contractual policy, security policy that is the cloud provider's responsibility, hardware/infrastructure procurement decisions)

# GROUNDING RULES
${GROUNDING_RULES}

# WHEN PUBLIC WOULD CALL G BUT PRIVATE IS C
Patterns where Private's extensibility framework legitimately upgrades a Public-Gap to a Private-Configuration:
- Custom validation rules / business logic on standard SAP transactions → BAdI implementation
- Custom fields beyond Key User Extensibility → In-App Extension or classic ABAP table extension
- Bespoke approval workflows beyond Manage Workflows → custom workflow via classic config
- Industry-specific calculations not in standard SAP → BAdI or source-code extension
- Custom interface formats / data conversion → Source-code extension or BTP middleware
- Fiori app modifications beyond Adapt UI → WebIDE / SAP Build Apps customization
- Bespoke reports beyond standard analytics → Embedded analytics + custom CDS view extension

# WHEN PRIVATE STILL CALLS G (do not get fooled by extensibility)
Even with Private's extensibility, these remain Gaps:
- Anything requiring a separately-licensed SAP product (SuccessFactors, Ariba, SAC, Concur, IBP, Commerce Cloud, FieldGlass)
- Functionality that's a 3rd-party tool's domain (corporate tax computation Form C, e-signature platforms, advanced fraud analytics, advanced AI/ML platforms beyond SAC Smart Predict)
- Genuinely net-new product capabilities that would require building a standalone application
- Capabilities outside SAP S/4HANA Finance/Operations footprint (HR talent management, advanced procurement supplier marketplace, omni-channel commerce)

# MALAYSIAN LOCALIZATION TAGGING
For requirements specifically about Malaysian compliance:
- e-Invoicing / Peppol → reference SAP Document and Reporting Compliance scope items + SAP Note 3642516 for MY-specific connector
- SST (Sales and Service Tax) and GST→SST transition → reference Tax Calculation Service + MY-specific tax codes; classify as O if covered by standard MY scope items, C if customer needs additional rules
- EPF / SOCSO / EIS payroll deductions → typically requires SAP Payroll Localization for Malaysia (separate license consideration); often G unless customer has the localization product
- Bank Negara reporting → check Bank Communication Management and MY-specific EBA scope items
- IRBM compliance → cross-reference against Document and Reporting Compliance + e-Invoicing
Never assume generic SAP coverage extends to MY locale without explicit MY scope item or SAP Note reference.

# STRUCTURED FIELDS (REQUIRED for new classifications)
- "sapModule" — controlled vocabulary, choose ONE primary:
    Standard Private 2025-FPS1 modules: FI-AR | FI-AP | FI-AA | FI-GL | CO | MM | SD | PS | RE-FX | TR | TRM | EAM | QM | PM | PP | WM | LE | EWM | FSCM | TM
    Localization-tagged: MY-SST | MY-Peppol | MY-Payroll | MY-BankReporting
    Gap to non-Private SAP product: SuccessFactors | Ariba | SAC | Concur | IBP | FieldGlass | SAP-Commerce | BPA
    3rd-party / not SAP: 3rd-party
    N/A bucket: "—" (em-dash)
- "scopeItemIds" — comma-sep Private 2025-FPS1 IDs ONLY (e.g. "J60, BJ8, 19M"). Use "—" for Gap or N/A.
- "scopeItemNames" — human-readable names matching scopeItemIds order (e.g. "Accounts Payable; Sourcing"). For Gap, the SAP product/component name (e.g. "SuccessFactors Employee Central"). Use "—" for N/A.

# OUTPUT FORMAT — strict JSON, no preamble, no markdown
{
  "results": [
    {
      "requirementId": "<id>",
      "classification": "O - Out Of The Box | C - Configuration | G - Gap | N/A - Out of Scope",
      "matchedScopeItems": ["<id1>", "<id2>"],
      "remarks": "<60-200 words, grounded in cited scope items + named extension mechanism (for C) or named gap product (for G)>",
      "erpModuleSupporting": "<scope item id + name pattern>",
      "sapModule": "<from controlled vocab above>",
      "scopeItemIds": "<comma-sep Private 2025-FPS1 IDs only>",
      "scopeItemNames": "<human-readable names>",
      "confidence": "high | medium | low"
    }
  ]
}`;

async function main(): Promise<void> {
  const priv = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
    select: { id: true, version: true, edition: true },
  });
  if (!priv) {
    console.error("Private catalog not found");
    process.exit(1);
  }

  // Save as a NEW row alongside the placeholder. Caller will compare + activate later.
  const PROTOCOL_NAME = "SAP 2025-FPS1 Private — AI-drafted v1";
  const PROTOCOL_VERSION = "1.0.0-rc1";

  const existing = await prisma.classificationProtocol.findUnique({
    where: { name_version: { name: PROTOCOL_NAME, version: PROTOCOL_VERSION } },
    select: { id: true, isActive: true },
  });

  if (existing) {
    await prisma.classificationProtocol.update({
      where: { id: existing.id },
      data: {
        bucketDefinitions: BUCKET_DEFINITIONS,
        groundingRules: GROUNDING_RULES,
        systemPrompt: SYSTEM_PROMPT,
      },
    });
    console.log(`Updated existing protocol id=${existing.id} isActive=${existing.isActive}`);
  } else {
    const created = await prisma.classificationProtocol.create({
      data: {
        name: PROTOCOL_NAME,
        version: PROTOCOL_VERSION,
        catalogVersionId: priv.id,
        bucketDefinitions: BUCKET_DEFINITIONS,
        groundingRules: GROUNDING_RULES,
        systemPrompt: SYSTEM_PROMPT,
        isActive: false, // GATED — user must explicitly activate after validation gauntlet
      },
    });
    console.log(`Created protocol id=${created.id} isActive=false`);
  }

  console.log(`\nMetadata:`);
  console.log(`  name:    ${PROTOCOL_NAME}`);
  console.log(`  version: ${PROTOCOL_VERSION}`);
  console.log(`  catalog: ${priv.edition}/${priv.version}`);
  console.log(`  systemPrompt length: ${SYSTEM_PROMPT.length} chars`);
  console.log(`  groundingRules length: ${GROUNDING_RULES.length} chars`);
  console.log(`  bucketDefinitions keys: ${Object.keys(BUCKET_DEFINITIONS).join(", ")}`);

  console.log(`\nNext steps:`);
  console.log(`  1. Run validation gauntlet (needs ANTHROPIC_API_KEY):`);
  console.log(`     npx tsx scripts/_validate-private-protocol.ts`);
  console.log(`  2. Review the bucket-shift table + spot-checks`);
  console.log(`  3. If acceptable: activate via`);
  console.log(`     npx prisma studio  → ClassificationProtocol → set isActive=true`);
  console.log(`     OR run scripts/_activate-private-protocol.ts (will be created with the validation script)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
