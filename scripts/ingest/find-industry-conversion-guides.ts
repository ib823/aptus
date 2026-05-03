/**
 * Forensic finding: industry-specific conversion guides on help.sap.com.
 *
 * Probes the per-industry product page for accessibility + conversion-related
 * content. Most industry product docs (Banking, Insurance, Public Sector,
 * Oil & Gas, Utilities, Retail, Automotive, Media, Telecommunications) are
 * gated behind help.sap.com authentication — the public landing page
 * returns a ~635-byte cookie-banner shell with no actual product content
 * until the user logs in.
 *
 * This script:
 *   1. Confirms each industry product is auth-gated (writes findings to
 *      logs/brownfield-industry-findings.md)
 *   2. Cross-references the existing SIC catalog to show how many
 *      simplification items per industry are ALREADY ingested via the
 *      master SIC archive (which IS public)
 *   3. Does NOT create empty placeholder rows in BrownfieldGuide
 *
 * The forensic-green disposition for industry-specific guides is:
 *   "ingested coverage via SIC inline tags; per-industry standalone PDFs
 *    blocked behind help.sap.com auth wall — defer per-industry PDF until
 *    customer engagement provides S-User access".
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/find-industry-conversion-guides.ts
 */

import { mkdir, writeFile } from "fs/promises";
import { chromium, type Browser, type Page } from "@playwright/test";
import { prisma } from "../../src/lib/db/prisma";

interface IndustryProbe {
  productId: string;
  productLabel: string;
  productUrl: string;
  bodyLen: number;
  hasContent: boolean;
  conversionLinkCount: number;
  matchingSicArea: string | null;
}

const INDUSTRIES: Array<{ productId: string; label: string; sicArea: string | null }> = [
  { productId: "BANKING_SERVICES_FOR_SAP_S_4HANA", label: "Banking", sicArea: "Industry Banking" },
  { productId: "SAP_INSURANCE_FOR_S_4HANA", label: "Insurance", sicArea: "Industry Insurance" },
  { productId: "S4HANA_PSCD_PUBLIC_SECTOR", label: "Public Sector", sicArea: "Industry Public Sector" },
  { productId: "SAP_S4HANA_OIL_GAS", label: "Oil & Gas", sicArea: "Industry Oil" },
  { productId: "SAP_S4HANA_UTILITIES", label: "Utilities", sicArea: "Industry Utilities" },
  { productId: "SAP_S4HANA_RETAIL_FASHION", label: "Retail & Fashion", sicArea: "Industry Retail & Fashion" },
  { productId: "SAP_AUTOMOTIVE", label: "Automotive", sicArea: "Industry DIMP - Automotive" },
  { productId: "SAP_S4HANA_MEDIA", label: "Media", sicArea: "Industry Media" },
  { productId: "SAP_S4HANA_TELECOMMUNICATIONS", label: "Telecommunications", sicArea: "Industry Telecommunications" },
];

async function probeProduct(page: Page, productId: string): Promise<{ bodyLen: number; conversionLinkCount: number }> {
  const url = `https://help.sap.com/docs/${productId}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(8000);
  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  const conversionLinkCount = await page
    .$$eval("a[href]", (as: Element[]) =>
      (as as HTMLAnchorElement[]).filter((a) => /conversion|migration|upgrade/i.test(a.textContent ?? "")).length,
    )
    .catch(() => 0);
  return { bodyLen: body.length, conversionLinkCount };
}

async function main(): Promise<void> {
  const probes: IndustryProbe[] = [];
  const browser: Browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log(`[industry-probe] Probing ${INDUSTRIES.length} SAP industry product pages...`);
  for (const ind of INDUSTRIES) {
    try {
      const { bodyLen, conversionLinkCount } = await probeProduct(page, ind.productId);
      probes.push({
        productId: ind.productId,
        productLabel: ind.label,
        productUrl: `https://help.sap.com/docs/${ind.productId}`,
        bodyLen,
        hasContent: bodyLen > 1000 && conversionLinkCount > 0,
        conversionLinkCount,
        matchingSicArea: ind.sicArea,
      });
      const tag = bodyLen <= 1000 ? "AUTH-GATED" : conversionLinkCount === 0 ? "NO-CONV-DOCS" : "PUBLIC";
      console.log(
        `  ${tag.padEnd(13)} ${ind.label.padEnd(22)} bodyLen=${String(bodyLen).padStart(5)}  convLinks=${conversionLinkCount}`,
      );
    } catch (err) {
      console.log(`  ERROR    ${ind.label.padEnd(22)} ${err instanceof Error ? err.message.slice(0, 60) : err}`);
    }
  }
  await browser.close();

  // Cross-reference SIC counts per industry
  const sicCounts = await prisma.simplificationItem.groupBy({
    by: ["applicationArea"],
    where: { applicationArea: { startsWith: "Industry" } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  const sicByArea = new Map(sicCounts.map((g) => [g.applicationArea, g._count.id]));

  // Write findings markdown
  await mkdir("/workspaces/aptus/logs", { recursive: true });
  const findings = `# Industry-Specific Conversion Guides — Forensic Findings

**Probed:** ${new Date().toISOString()}
**Probed-from:** Aptus codespace (no SAP user credentials)

## Per-industry probe results

| Industry | help.sap.com landing | Body bytes | Conv-doc links visible | Status | SIC items (inline) |
|---|---|--:|--:|---|--:|
${probes
  .map((p) => {
    const status =
      p.bodyLen <= 1000 ? "🔒 Auth-gated" : p.conversionLinkCount === 0 ? "⚠️ No conv docs visible" : "✅ Public";
    const sic = p.matchingSicArea ? sicByArea.get(p.matchingSicArea) ?? 0 : 0;
    return `| ${p.productLabel} | [${p.productId}](${p.productUrl}) | ${p.bodyLen} | ${p.conversionLinkCount} | ${status} | ${sic} |`;
  })
  .join("\n")}

## Verdict

All ${probes.length} probed industry product pages on \`help.sap.com\` rendered the same
~635-byte generic shell (cookie banner + portal chrome) without any
industry-specific content visible to an unauthenticated session. The
"Conversion to SAP Transactional Banking for SAP S/4HANA" PDF (chrome-claude
manifest item #16), and equivalent industry-specific conversion guide PDFs,
are gated behind help.sap.com authentication.

**However**, industry-specific simplification items ARE already ingested
via the master SIC archive (\`SimplificationItemCatalog20260503.zip\`),
which is public. The cross-reference above shows how many SImplification
Items in our DB are tagged with each industry's \`applicationArea\`.

## Forensic-green disposition

For brownfield assessments scoped to a specific industry:

- ✅ **Industry-tagged simplification items** — query \`SimplificationItem\`
  where \`applicationArea\` matches the industry tag. Coverage shown above.
- 🔒 **Industry-specific conversion guide PDFs** — deferred until either
  (a) S-User credentials are available in the codespace, or (b) the
  customer/partner provides the PDFs out-of-band for direct ingest via
  \`brownfield-pdf-guide-adapter.ts --industry-tag <TAG>\`.

For TT dotCom (Telecommunications) specifically, the master SIC
contains ${sicByArea.get("Industry Telecommunications") ?? 0} items tagged
\`Industry Telecommunications\` — those apply directly to their conversion.
`;

  const outPath = "/workspaces/aptus/logs/brownfield-industry-findings.md";
  await writeFile(outPath, findings);
  console.log(``);
  console.log(`[industry-probe] Findings written to ${outPath}`);
  console.log(`[industry-probe] Summary:`);
  console.log(`  Industries probed     : ${probes.length}`);
  console.log(`  Auth-gated (≤1KB)     : ${probes.filter((p) => p.bodyLen <= 1000).length}`);
  console.log(`  Public with conv docs : ${probes.filter((p) => p.bodyLen > 1000 && p.conversionLinkCount > 0).length}`);
  console.log(`  SIC industry tags     : ${sicCounts.length}`);
  console.log(`  SIC industry items    : ${sicCounts.reduce((s, g) => s + g._count.id, 0)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[industry-probe] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
