// Restyle parity screenshots for the Affirm external surface.
// Seeds a fresh issued bundle + device-verified grant, drives the journey, and
// captures each screen at 1440 and 390. Requires the dev server on :3003 with
// AFFIRM_EXTERNAL_ENABLED=true. Usage: node scripts/affirm-external-screenshots.mjs
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { mkdirSync } from "fs";

const OUT = "docs/affirm-external/screenshots";
const UA = "AffirmShots/1.0 (Playwright) Chrome/142.0.0.0";
const uaHash = createHash("sha256").update(UA.replace(/Chrome\/[\d.]+/g, "Chrome/").trim()).digest("hex");
const hashToken = (r) => createHash("sha256").update(r).digest("hex");
const BASE = "http://localhost:3003";

const prisma = new PrismaClient();

async function seed() {
  const items = await prisma.affirmScopeItem.findMany({
    where: { streamId: { in: ["lead-to-cash", "source-to-pay"] } },
    select: { id: true },
  });
  const bundle = await prisma.affirmBundle.create({
    data: { client: "PETRONAS Chemicals", state: "issued", issuedAt: new Date() },
  });
  await prisma.affirmBundleScopeItem.createMany({
    data: items.map((i) => ({ bundleId: bundle.id, scopeItemId: i.id })),
    skipDuplicates: true,
  });
  const raw = randomBytes(32).toString("base64url");
  await prisma.affirmAccessGrant.create({
    data: {
      bundleId: bundle.id,
      email: "aisyah@petronas.example",
      displayName: "Aisyah",
      roleLabel: "Chief Financial Officer",
      tokenHash: hashToken(raw),
      valueStreamIds: [],
      otpVerifiedUaHashes: [uaHash],
    },
  });
  return { token: raw };
}

async function shot(page, name) {
  for (const [w, h, tag] of [[1440, 1000, "1440"], [390, 844, "390"]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}.${tag}.png`, fullPage: true });
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { token } = await seed();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();

  // S1 landing
  await page.goto(`${BASE}/a/${token}`, { waitUntil: "networkidle" });
  await shot(page, "s1-landing");
  // ack + begin → home
  await page.getByRole("checkbox", { name: /authorised to review/i }).check();
  await page.getByRole("button", { name: /begin review/i }).click();
  await page.waitForURL(/\/a\/home$/, { timeout: 15000 });
  await shot(page, "s4-home");
  // stream
  await page.goto(`${BASE}/a/stream/source-to-pay`, { waitUntil: "networkidle" });
  await shot(page, "s5-stream");
  // process (J45 reviewed)
  await page.goto(`${BASE}/a/process/J45`, { waitUntil: "networkidle" });
  await shot(page, "s6-process");
  // affirm
  await page.goto(`${BASE}/a/affirm/J45`, { waitUntil: "networkidle" });
  await shot(page, "s7-affirm");
  // terminal
  await page.goto(`${BASE}/a/expired`, { waitUntil: "networkidle" });
  await shot(page, "s3-terminal");

  await browser.close();
  await prisma.$disconnect();
  console.log("screenshots written to", OUT);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
