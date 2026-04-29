/**
 * Regenerate every PNG brand asset from the canonical SVG sources.
 *
 * Canonical SVGs live in `public/icons/`. This script rasterizes them into
 * the four PNG sizes the platform needs:
 *
 *   public/icons/icon-192x192.png   — manifest + apple-touch-icon
 *   public/icons/icon-512x512.png   — manifest large
 *   src/app/icon.png                — Next.js favicon convention (32×32)
 *   src/app/apple-icon.png          — Next.js Apple touch icon (180×180)
 *
 * Run once after editing `public/icons/aptus-mark.svg` (or as part of CI).
 *   pnpm tsx scripts/regenerate-brand-pngs.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(__dirname, "..");
const MARK_SVG = path.join(ROOT, "public", "icons", "aptus-mark.svg");

type Tint = "default" | "white";

const TARGETS: Array<{ output: string; size: number; tint: Tint }> = [
  { output: path.join(ROOT, "public", "icons", "icon-192x192.png"), size: 192, tint: "default" },
  { output: path.join(ROOT, "public", "icons", "icon-512x512.png"), size: 512, tint: "default" },
  { output: path.join(ROOT, "src", "app", "icon.png"), size: 32, tint: "default" },
  { output: path.join(ROOT, "src", "app", "apple-icon.png"), size: 180, tint: "default" },
  // White variant — embedded in PDF cover bands and any dark-background surface.
  { output: path.join(ROOT, "public", "icons", "aptus-mark-white.png"), size: 512, tint: "white" },
];

function applyTint(svgText: string, tint: Tint): string {
  if (tint === "default") return svgText;
  // Canonical SVG omits `fill` so it inherits `currentColor` (black). Inject
  // an explicit white fill on the path for the white variant.
  return svgText.replace(/<path /g, '<path fill="white" ');
}

async function main() {
  const svgText = readFileSync(MARK_SVG, "utf-8");
  for (const { output, size, tint } of TARGETS) {
    const tintedSvg = Buffer.from(applyTint(svgText, tint));
    const png = await sharp(tintedSvg, { density: 2400 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(output, png);
    console.log(`✓ ${path.relative(ROOT, output)}  (${png.length} bytes, ${tint})`);
  }
  console.log("\nAll PNG brand assets regenerated from canonical SVG.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
