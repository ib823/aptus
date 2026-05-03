/**
 * SAP Business Transformation Center (BTC) — Selective Data Transition (SDT)
 * docs crawler. Ingests each top-level guide page as a BrownfieldGuide row
 * tagged conversionPath="SELECTIVE_DATA_TRANSITION" with mimeType="text/html".
 *
 * BTC docs are JS-rendered SPAs on help.sap.com. We use Playwright to render,
 * extract the article body innerText, and persist with the source URL +
 * sha256 of the rendered text for idempotency.
 *
 * Capped at ~25 docs (the canonical Discover/Implement/Use sections).
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/btc-docs-crawler.ts
 */

import { createHash } from "crypto";
import { chromium, type Browser, type Page } from "@playwright/test";
import { prisma } from "../../src/lib/db/prisma";

const PAGE_TIMEOUT_MS = 60000;
const RENDER_WAIT_MS = 12000;
const MAX_PAGES = 25;

const ROOT_URL = "https://help.sap.com/docs/btc?locale=en-US";

// Seed URLs known to host substantial content. Crawler also auto-discovers
// linked /docs/BTC/* pages from the root and from each visited page.
const SEED_PATHS: string[] = [
  // (will be discovered from the root page)
];

interface CrawlResult {
  url: string;
  title: string;
  textLength: number;
  ingested: boolean;
  reused: boolean;
  error?: string;
}

async function renderAndExtract(page: Page, url: string): Promise<{ title: string; text: string; html: string }> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
  await page.waitForTimeout(RENDER_WAIT_MS);
  const title = await page.title();
  const text = await page.evaluate(() => {
    // Try article/main first; fall back to body. innerText is only on
    // HTMLElement, so cast at the DOM read site.
    const article = document.querySelector("article, main, [role='main']");
    const root = (article ?? document.body) as HTMLElement;
    return root.innerText;
  });
  const html = await page.content();
  return { title, text, html };
}

async function discoverBtcLinks(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (as: Element[]) =>
    (as as HTMLAnchorElement[])
      .map((a) => a.href)
      .filter((h) => /\/docs\/BTC\//i.test(h)),
  );
  return Array.from(new Set(hrefs));
}

async function main(): Promise<void> {
  console.log(`[btc-crawler] Starting headless Chromium`);
  const browser: Browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const results: CrawlResult[] = [];
  const visited = new Set<string>();

  // Resolve catalog (reuse the active one)
  const catalog = await prisma.brownfieldCatalogVersion.findFirst({
    where: { isActive: true },
    orderBy: { ingestedAt: "desc" },
  });
  if (!catalog) {
    throw new Error("No active BrownfieldCatalogVersion. Ingest a SIC archive first.");
  }
  const catalogId = catalog.id;

  // Step 1: render the root page and discover BTC sub-page links
  console.log(`[btc-crawler] Rendering root: ${ROOT_URL}`);
  await page.goto(ROOT_URL, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
  await page.waitForTimeout(RENDER_WAIT_MS);
  const discovered = await discoverBtcLinks(page);
  // Strip URL fragments, dedup, prepend seed paths if any
  const candidates = Array.from(new Set([...SEED_PATHS, ...discovered]))
    .map((u) => u.split("#")[0]!)
    .filter((u, i, a) => a.indexOf(u) === i);
  console.log(`[btc-crawler] Discovered ${candidates.length} BTC URLs (will cap at ${MAX_PAGES})`);

  // Always include the root in the ingestion set
  const targets = [ROOT_URL, ...candidates].slice(0, MAX_PAGES);

  for (const url of targets) {
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      console.log(`[btc-crawler] [${results.length + 1}/${targets.length}] ${url}`);
      const { title, text, html } = await renderAndExtract(page, url);
      void html;
      const cleanText = text.replace(/\s+/g, " ").trim();
      if (cleanText.length < 200) {
        results.push({ url, title, textLength: cleanText.length, ingested: false, reused: false, error: "too_short" });
        continue;
      }
      const sha256 = createHash("sha256").update(cleanText).digest("hex");

      const existing = await prisma.brownfieldGuide.findUnique({ where: { sha256 } });
      if (existing) {
        results.push({ url, title, textLength: cleanText.length, ingested: false, reused: true });
        continue;
      }

      const buf = Buffer.from(cleanText, "utf8");
      await prisma.brownfieldGuide.create({
        data: {
          catalogVersionId: catalogId,
          title: title || url,
          sourceDocument: `BTC:${title.slice(0, 80)}`,
          sourceUrl: url,
          mimeType: "text/html",
          fileSizeBytes: buf.byteLength,
          sha256,
          content: buf,
          conversionPath: "SELECTIVE_DATA_TRANSITION",
          notes:
            `Crawled from help.sap.com/docs/btc on ${new Date().toISOString().slice(0, 10)} via Playwright headless render. ` +
            `mimeType=text/html (rendered article body); raw HTML available on re-fetch.`,
        },
      });
      results.push({ url, title, textLength: cleanText.length, ingested: true, reused: false });
    } catch (err) {
      results.push({
        url,
        title: "(error)",
        textLength: 0,
        ingested: false,
        reused: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await browser.close();

  console.log(``);
  console.log(`[btc-crawler] Done.`);
  console.log(`  Visited       : ${results.length}`);
  console.log(`  Ingested      : ${results.filter((r) => r.ingested).length}`);
  console.log(`  Reused (sha)  : ${results.filter((r) => r.reused).length}`);
  console.log(`  Errors        : ${results.filter((r) => r.error).length}`);
  if (results.some((r) => r.error)) {
    console.log(`  First 3 errors:`);
    for (const r of results.filter((r) => r.error).slice(0, 3)) {
      console.log(`    - ${r.url}: ${r.error}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[btc-crawler] Failed:", err);
    void prisma.$disconnect();
    process.exit(1);
  });
