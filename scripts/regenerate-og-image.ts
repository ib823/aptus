/**
 * Regenerate the OpenGraph / Twitter share image from the canonical lockup.
 *
 *   src/app/opengraph-image.png   — 1200×630, served via Next.js convention
 *
 * The image is a centered Aptus lockup on the brand-color background so it
 * looks correct in any Slack/Twitter/LinkedIn unfurl. Run alongside
 * `regenerate-brand-pngs.ts` whenever the canonical SVGs change.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(__dirname, "..");
const LOCKUP_SVG = path.join(ROOT, "public", "icons", "aptus-lockup.svg");
const OG_OUTPUT = path.join(ROOT, "src", "app", "opengraph-image.png");
const TWITTER_OUTPUT = path.join(ROOT, "src", "app", "twitter-image.png");

const APTUS_BRAND_COLOR = { r: 11, g: 11, b: 15 };
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const LOCKUP_WIDTH = 720;

async function main() {
  const svg = readFileSync(LOCKUP_SVG)
    .toString()
    .replace(/<path /g, '<path fill="white" ')
    .replace(/<text /g, '<text fill="white" ');

  const lockupPng = await sharp(Buffer.from(svg), { density: 2400 })
    .resize({ width: LOCKUP_WIDTH })
    .png()
    .toBuffer();

  const composed = await sharp({
    create: {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      channels: 4,
      background: { ...APTUS_BRAND_COLOR, alpha: 1 },
    },
  })
    .composite([{ input: lockupPng, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(OG_OUTPUT, composed);
  writeFileSync(TWITTER_OUTPUT, composed);
  console.log(`✓ ${path.relative(ROOT, OG_OUTPUT)}  (${composed.length} bytes)`);
  console.log(`✓ ${path.relative(ROOT, TWITTER_OUTPUT)}  (${composed.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
