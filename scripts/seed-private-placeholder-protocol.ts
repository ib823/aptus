/**
 * Phase 13.3 — Placeholder Private Edition classification protocol.
 *
 * Seeds an `isActive=false` ClassificationProtocol row pinned to the
 * Private 2025-FPS1 catalog so the engineering plumbing (catalog filter,
 * candidate selection, verdict-writer protocol pinning) can be exercised
 * end-to-end without an SI lead's authored protocol blocking the work.
 *
 * The system prompt below is a stub — it copies the Public 2602 protocol
 * structure with a Private-Edition addendum noting BAdI / classic-config /
 * source-extension availability. It MUST NOT be used in production
 * classification runs until an SI lead reviews + activates it.
 *
 * Once the SI lead authors the real Private protocol:
 *   1. Update this script's text to the final version (or replace via admin UI)
 *   2. Set isActive=true via `prisma.classificationProtocol.update(...)`
 *   3. Confirm via `prisma migrate status` + a smoke classification run
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLACEHOLDER_SYSTEM_PROMPT = `You are an SAP S/4HANA Cloud Private Edition fit-to-standard classification expert.

# Edition context — PRIVATE EDITION 2025-FPS1
You are classifying client requirements against the SAP S/4HANA Cloud **Private Edition** 2025-FPS1 catalog. Unlike Public Edition, Private Edition exposes:
- BAdIs (Business Add-Ins) — extension points for custom logic without forking the core
- Classic in-app configuration (more permissive than Public's curated SSCUI set)
- Source-code extensions (custom ABAP) on the customer's tenant
- Native ABAP development for genuinely bespoke requirements
- Broader range of FIORI app modifications

This means many requirements that would be a GAP on Public Edition can be classified as CONFIGURE on Private Edition because the necessary extensibility is available natively.

# Output buckets
- **O — Out Of The Box**: Requirement is met by stock SAP best-practice configuration as documented in the cited Private 2025-FPS1 scope items, with no extension or BAdI needed.
- **C — Configuration**: Requirement is met via in-app configuration (SSCUI, classic config, BAdI implementation, or supported FIORI personalization) using the cited Private 2025-FPS1 scope items.
- **G — Gap**: Requirement cannot be met within Private Edition's extensibility envelope. Requires net-new development beyond BAdIs, source-code extensions, or 3rd-party add-ons.
- **N/A — Out of Scope**: Requirement falls outside the SAP S/4HANA Finance/Operations footprint entirely (separate product, e.g. SuccessFactors, Ariba, SAC, or non-SAP).

# Grounding rules
1. Every classification MUST cite at least one scope item ID from the candidate list. Do not hallucinate scope item IDs.
2. Confidence levels:
   - high: cited scope items directly cover the requirement; standard SAP guidance applies
   - medium: cited scope items partly cover the requirement; some adjustment expected
   - low: cited scope items only loosely match; reviewer should verify
3. When the same requirement could be O on a curated path or C on a configurable path, prefer the simpler classification (O).
4. When the requirement is met via BAdI / classic config / source extension, classify as C and explicitly note the extension type in remarks ("via BAdI", "via classic config", "via source extension").
5. The vendor's pre-existing remarks are NOT authoritative. Classify on the merits of the SAP catalog only.

# Output format
Return STRICT JSON:
{
  "results": [
    {
      "requirementId": "...",
      "classification": "O - Out Of The Box" | "C - Configuration" | "G - Gap" | "N/A - Out of Scope",
      "matchedScopeItems": ["J60", "BD9"],
      "remarks": "<3-5 sentence narrative grounded in cited scope items>",
      "erpModuleSupporting": "<canonical SAP module e.g. 'Finance / Accounts Payable (J60)'>",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

— END PLACEHOLDER PRIVATE PROTOCOL —

THIS IS A PLACEHOLDER. Awaiting SI-lead authoring before isActive=true.`;

const PLACEHOLDER_GROUNDING_RULES = `Phase 13.3 placeholder — see systemPrompt for full rules. Each verdict MUST cite at least one scope item ID from the candidate list (Private 2025-FPS1 only).`;

const PLACEHOLDER_BUCKET_DEFINITIONS = {
  O: "Out Of The Box — stock Private 2025-FPS1 best-practice config covers it.",
  C: "Configuration — met via SSCUI / classic config / BAdI / FIORI personalization / source extension within Private's extensibility envelope.",
  G: "Gap — beyond Private's extensibility envelope; needs 3rd-party or net-new product.",
  "N/A": "Out of Scope — outside SAP S/4HANA Finance/Operations footprint.",
};

async function main(): Promise<void> {
  const privateCatalog = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
    select: { id: true, version: true, edition: true },
  });
  if (!privateCatalog) {
    console.error(
      "Private 2025-FPS1 catalog version not found. Run scripts/ingest/dispatcher.ts on the Private archive first.",
    );
    process.exit(1);
  }
  console.log(
    `Found catalog: ${privateCatalog.edition}/${privateCatalog.version} (id=${privateCatalog.id})`,
  );

  const existing = await prisma.classificationProtocol.findFirst({
    where: { catalogVersionId: privateCatalog.id, name: "SAP 2025-FPS1 Private placeholder" },
  });

  if (existing) {
    console.log(`Placeholder already exists (id=${existing.id}, isActive=${existing.isActive}). Updating text.`);
    await prisma.classificationProtocol.update({
      where: { id: existing.id },
      data: {
        systemPrompt: PLACEHOLDER_SYSTEM_PROMPT,
        groundingRules: PLACEHOLDER_GROUNDING_RULES,
        bucketDefinitions: PLACEHOLDER_BUCKET_DEFINITIONS,
      },
    });
    console.log("  Updated.");
  } else {
    const created = await prisma.classificationProtocol.create({
      data: {
        name: "SAP 2025-FPS1 Private placeholder",
        version: "0.1.0-placeholder",
        catalogVersionId: privateCatalog.id,
        bucketDefinitions: PLACEHOLDER_BUCKET_DEFINITIONS,
        groundingRules: PLACEHOLDER_GROUNDING_RULES,
        systemPrompt: PLACEHOLDER_SYSTEM_PROMPT,
        isActive: false, // Engineering plumbing only — not for production runs
      },
    });
    console.log(`  Created placeholder protocol id=${created.id} isActive=false`);
  }

  console.log("\nDone. Activate via:");
  console.log(
    `  await prisma.classificationProtocol.update({ where: { id: ... }, data: { isActive: true } })`,
  );
  console.log("...AFTER an SI lead has reviewed + signed off the systemPrompt text.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
