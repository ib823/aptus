/**
 * Phase 2 — AD-4: seed the canonical SAP 2602 classification protocol.
 *
 * Captures the current SAP_2602_PROTOCOL prose verbatim into a
 * ClassificationProtocol DB row, pinned to the PUBLIC_2602 ScopeCatalogVersion
 * (created by Phase 1's seed-catalog-versions.ts).
 *
 * Idempotent — re-running is a no-op if the (name, version) combination
 * already exists.
 *
 * Usage:
 *   $ pnpm tsx scripts/seed-classification-protocol.ts
 */

import { PrismaClient } from "@prisma/client";

const PROTOCOL_NAME = "SAP 2602 best-practice";
const PROTOCOL_VERSION = "1.0.0";

const BUCKET_DEFINITIONS = {
  "O - Out Of The Box":
    "capability is in the 2602 baseline as-is, no customization needed",
  "C - Configuration":
    "capability needs SSCUI / Key User Extensibility / Output Management / Manage Workflows / Adapt UI / Adobe Forms / Communication Arrangement setup, all within the 2602 baseline",
  "G - Gap":
    "requires a separate licensed SAP product (SuccessFactors EC, Ariba, SAC Planning, SAC Smart Predict, SAP Commerce Cloud, FieldGlass, etc.) OR a 3rd-party tool (Vertex / ONESOURCE for corporate tax, Avalara, Adobe Sign, etc.) — NOT in the 2602 baseline",
  "N/A - Out of Scope":
    "not a SAP capability question (vendor commercial pre-qualification, ESG offerings, vendor track record, contractual policy, security policy that's the cloud provider's responsibility, etc.)",
};

const GROUNDING_RULES = `- Reference scope items by ID + name (e.g. "5XU Document and Reporting Compliance")
- Be brutally honest about Gaps — do NOT invent OOTB coverage that isn't in the candidate list
- For Configuration, name the specific config mechanism (SSCUI / KUE / Adapt UI / Manage Workflows / Output Management / Adobe Forms / Communication Arrangement)
- For Gap, explicitly name the separate product needed; note any partial workaround within 2602
- "scopeItems" should be the top 1-3 scope item IDs + names from the candidate list that cover this requirement; empty string if none match (then it's a Gap or N/A by definition)`;

const SYSTEM_PROMPT = `You are a SAP FIT-to-Standard analyst working with the SAP S/4HANA Cloud Public Edition 2602 catalog.

Your job: classify each requirement in this batch against the candidate 2602 scope items, then produce a grounded narrative.

CLASSIFICATION RULES (use exact strings):
- "O - Out Of The Box"   — capability is in the 2602 baseline as-is, no customization needed
- "C - Configuration"    — capability needs SSCUI / Key User Extensibility / Output Management / Manage Workflows / Adapt UI / Adobe Forms / Communication Arrangement setup, all within the 2602 baseline
- "G - Gap"              — requires a separate licensed SAP product (SuccessFactors EC, Ariba, SAC Planning, SAC Smart Predict, SAP Commerce Cloud, FieldGlass, etc.) OR a 3rd-party tool (Vertex / ONESOURCE for corporate tax, Avalara, Adobe Sign, etc.) — NOT in the 2602 baseline
- "N/A - Out of Scope"   — not a SAP capability question (vendor commercial pre-qualification, ESG offerings, vendor track record, contractual policy, security policy that's the cloud provider's responsibility, etc.)

GROUNDING RULES:
${GROUNDING_RULES}

STRUCTURED FIELDS (REQUIRED for new classifications):
- "sapModule" — controlled vocabulary, choose ONE primary:
    OOTB / Config in 2602: FI-AR | FI-AP | FI-AA | FI-GL | CO | MM | SD | PS | RE-FX | TR | TRM
    Gap to non-2602 SAP product: SuccessFactors | Ariba | SAC | BPA | IS | EAM | Convergent-Invoicing | ABAP-Environment | BTP-Other
    Gap to 3rd-party / not SAP: 3rd-party
    N/A bucket: "—" (em-dash)
- "scopeItemIds" — comma-sep 2602 IDs ONLY (e.g. "J45, BMD, 19C"). Use "—" for Gap or N/A.
- "scopeItemNames" — human-readable names matching scopeItemIds order (e.g. "Procurement of Services; Procurement of Direct Materials"). For Gap, the SAP product/component name (e.g. "SuccessFactors Employee Central"). Use "—" for N/A.

OUTPUT FORMAT — strict JSON, no preamble, no markdown:
{
  "results": [
    {
      "requirementId": "<id>",
      "classification": "O - Out Of The Box | C - Configuration | G - Gap | N/A - Out of Scope",
      "matchedScopeItems": ["<id1>", "<id2>"],
      "remarks": "<60-200 words, grounded in scope items + config mechanism / gap product>",
      "erpModuleSupporting": "<scope item id + name pattern>",
      "sapModule": "<from controlled vocab above>",
      "scopeItemIds": "<comma-sep IDs only>",
      "scopeItemNames": "<human-readable names>",
      "confidence": "high | medium | low"
    }
  ]
}`;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const catalogVersion = await prisma.scopeCatalogVersion.findUniqueOrThrow({
    where: { version_edition: { version: "2602", edition: "PUBLIC" } },
  });

  const existing = await prisma.classificationProtocol.findUnique({
    where: { name_version: { name: PROTOCOL_NAME, version: PROTOCOL_VERSION } },
  });

  if (existing) {
    console.log(`Protocol "${PROTOCOL_NAME} v${PROTOCOL_VERSION}" already exists (id=${existing.id}). No-op.`);
    await prisma.$disconnect();
    return;
  }

  const created = await prisma.classificationProtocol.create({
    data: {
      name: PROTOCOL_NAME,
      version: PROTOCOL_VERSION,
      catalogVersionId: catalogVersion.id,
      bucketDefinitions: BUCKET_DEFINITIONS,
      groundingRules: GROUNDING_RULES,
      systemPrompt: SYSTEM_PROMPT,
      isActive: true,
    },
  });

  console.log(`Created protocol id=${created.id} name="${created.name}" version="${created.version}" catalog=${catalogVersion.version}/${catalogVersion.edition}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
