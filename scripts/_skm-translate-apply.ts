/**
 * Apply BM translations + re-export the response matrix.
 *
 * Reads /workspaces/aptus/logs/skm-translations-bm.json (or any combination of
 * the per-module files under logs/skm-translations-bm-by-module/*.json) and
 * writes the BM remarks into a sidecar JSON the export script reads at write
 * time. No DB schema change.
 *
 * Sidecar location: /workspaces/aptus/data/skm-bm-remarks.json
 *   { [requirementId: string]: string }
 *
 * After running this, re-run _skm-export-response-matrix.ts to produce a new
 * XLSX with the "Justifikasi (BM)" column populated.
 */

import { mkdir, readFile, writeFile, readdir, stat } from "fs/promises";
import { join } from "path";

const SINGLE = "/workspaces/aptus/logs/skm-translations-bm.json";
const MULTI = "/workspaces/aptus/logs/skm-translations-bm-by-module";
const OUT = "/workspaces/aptus/data/skm-bm-remarks.json";

interface BmItem {
  id: string;
  remarksBm: string;
}

interface BmFile {
  items?: BmItem[];
  count?: number;
}

async function loadFromFile(path: string): Promise<BmItem[]> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as BmFile | BmItem[];
  if (Array.isArray(parsed)) return parsed;
  return parsed.items ?? [];
}

async function pathExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  const collected: BmItem[] = [];

  if (await pathExists(SINGLE)) {
    const items = await loadFromFile(SINGLE);
    collected.push(...items);
    console.log(`Loaded ${items.length} from ${SINGLE}`);
  }

  if (await pathExists(MULTI)) {
    const files = await readdir(MULTI);
    for (const f of files.filter((f) => f.endsWith(".json"))) {
      const items = await loadFromFile(join(MULTI, f));
      collected.push(...items);
      console.log(`Loaded ${items.length} from ${MULTI}/${f}`);
    }
  }

  if (collected.length === 0) {
    console.error("No translation files found. Expected:");
    console.error(`  ${SINGLE}`);
    console.error(`  or per-module chunks under ${MULTI}/`);
    process.exit(2);
  }

  // Validate + dedup (last wins, per id)
  const map: Record<string, string> = {};
  let invalid = 0;
  for (const it of collected) {
    if (!it.id || typeof it.remarksBm !== "string") { invalid++; continue; }
    map[it.id] = it.remarksBm.trim();
  }
  console.log(`Total entries: ${collected.length}  unique: ${Object.keys(map).length}  invalid: ${invalid}`);

  await mkdir("/workspaces/aptus/data", { recursive: true });
  await writeFile(OUT, JSON.stringify(map, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log("Run `pnpm tsx scripts/_skm-export-response-matrix.ts` to regenerate the XLSX with BM remarks.");
}

main().catch((e) => { console.error(e); process.exit(1); });
