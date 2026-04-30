/**
 * Gap 2 — backfill ScopeItem rows for Private 2025-FPS1 codes that have
 * a BPD docx but no BPD xlsx. The main private adapter creates ScopeItems
 * from xlsx, then enriches with docx — codes with docx-only never become
 * ScopeItems. This one-shot fixes that gap.
 *
 * Idempotent — re-running is a no-op once the stubs exist.
 */
import { PrismaClient } from "@prisma/client";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import path from "node:path";

const prisma = new PrismaClient();
const PRIVATE_ZIP =
  "/workspaces/aptus/SAP_Best_Practices_for_SAP_S4HANA_Cloud_Private_Edition_2025-FPS1_MY_SAPCUSTOMER.zip";

const BPD_RX =
  /^([A-Z0-9]+)_S4HANA(\d{4})-FPS(\d+)_BPD_EN_([A-Z]+)\.docx$/i;

async function main(): Promise<void> {
  const priv = await prisma.scopeCatalogVersion.findUnique({
    where: { version_edition: { version: "2025-FPS1", edition: "PRIVATE" } },
    select: { id: true },
  });
  if (!priv) throw new Error("Private 2025-FPS1 catalog not found");

  console.log(`Catalog: ${priv.id}`);
  console.log(`Loading: ${PRIVATE_ZIP}`);

  const zip = new AdmZip(PRIVATE_ZIP);
  const entries = zip.getEntries();

  // Collect all BPD codes (xlsx + docx)
  const xlsxCodes = new Set<string>();
  const docxByCode = new Map<string, AdmZip.IZipEntry>();
  for (const e of entries) {
    if (e.isDirectory) continue;
    if (!e.entryName.startsWith("S4O/Library/TestScripts/")) continue;
    const filename = path.basename(e.entryName);
    if (filename.endsWith(".xlsx")) {
      const m = filename.match(/^([A-Z0-9]+)_S4HANA\d{4}-FPS\d+_BPD_EN_/);
      if (m?.[1]) xlsxCodes.add(m[1]);
    } else if (filename.endsWith(".docx")) {
      const m = filename.match(BPD_RX);
      if (m?.[1]) docxByCode.set(m[1], e);
    }
  }

  // Codes with docx but no xlsx
  const docxOnly = Array.from(docxByCode.keys()).filter((c) => !xlsxCodes.has(c));
  console.log(`xlsx codes:     ${xlsxCodes.size}`);
  console.log(`docx codes:     ${docxByCode.size}`);
  console.log(`docx-only:      ${docxOnly.length}  → ${docxOnly.join(", ")}`);

  let created = 0;
  let skipped = 0;
  for (const code of docxOnly) {
    // Already exists? (idempotency check)
    const existing = await prisma.scopeItem.findUnique({
      where: { scopeCode_catalogVersionId: { scopeCode: code, catalogVersionId: priv.id } },
      select: { id: true, docxStored: true },
    });
    if (existing) {
      console.log(`  skip ${code} — already in DB (docxStored=${existing.docxStored})`);
      skipped++;
      continue;
    }

    const entry = docxByCode.get(code)!;
    const filename = path.basename(entry.entryName);
    const countryMatch = filename.match(BPD_RX);
    const country = countryMatch?.[4] ?? "XX";

    const buffer = entry.getData();
    let purposeHtml = "";
    let overviewHtml = "";
    let prerequisitesHtml = "";
    let nameClean = code;

    try {
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value;

      // Same section extraction logic as the main private adapter
      const sections = html.split(/<h[12][^>]*>/i);
      for (const section of sections) {
        const lower = section.toLowerCase();
        if (lower.startsWith("purpose") || lower.includes(">purpose<")) {
          const cIdx = section.indexOf(">");
          purposeHtml = (cIdx >= 0 ? section.substring(cIdx + 1) : section)
            .replace(/<\/h[12]>/gi, "")
            .trim();
        } else if (lower.startsWith("overview") || lower.includes(">overview<")) {
          const cIdx = section.indexOf(">");
          overviewHtml = (cIdx >= 0 ? section.substring(cIdx + 1) : section)
            .replace(/<\/h[12]>/gi, "")
            .trim();
        } else if (lower.startsWith("prerequisite") || lower.includes(">prerequisite")) {
          const cIdx = section.indexOf(">");
          prerequisitesHtml = (cIdx >= 0 ? section.substring(cIdx + 1) : section)
            .replace(/<\/h[12]>/gi, "")
            .trim();
        }
      }
      // Fallback: if no sections, store entire HTML as overview
      if (!purposeHtml && !overviewHtml && !prerequisitesHtml) {
        overviewHtml = html;
      }

      // Try to extract a human-readable name from the docx h1
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch?.[1]) {
        nameClean = titleMatch[1].replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim() || code;
      }
    } catch (err) {
      console.warn(`  WARN ${code}: docx parse failed: ${(err as Error).message}`);
    }

    await prisma.scopeItem.create({
      data: {
        scopeCode: code,
        name: nameClean === code ? code : `${nameClean}   (${code})`,
        nameClean,
        purposeHtml,
        overviewHtml,
        prerequisitesHtml,
        country,
        version: "2025-FPS1",
        catalogVersionId: priv.id,
        totalSteps: 0,
        functionalArea: "Uncategorized",
        subArea: "Uncategorized",
        xlsxStored: false,
        docxStored: true,
        setupPdfStored: false,
      },
    });
    created++;
    console.log(`  ✓ ${code}  ${nameClean}`);
  }

  console.log(`\nCreated: ${created}`);
  console.log(`Skipped (already exists): ${skipped}`);

  // Final verification
  const total = await prisma.scopeItem.count({ where: { catalogVersionId: priv.id } });
  console.log(`Total ScopeItem rows for Private 2025-FPS1: ${total} (expected ${258 + created})`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
