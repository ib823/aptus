/**
 * Writes docs/coreedge/capability-registry.json from the code (P0.15).
 *
 *   pnpm coreedge:registry            # regenerate the JSON
 *   pnpm coreedge:registry --check    # exit 1 if the committed JSON is stale
 *
 * The simulator (scripts/coreedge/simulate-gap-matrix.mjs) is plain Node and
 * cannot import TypeScript, so it reads this file instead of the registry
 * module. CI runs the --check form, so the JSON never says something the
 * registry, and so the code, does not.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { serializeCapabilityRegistry } from "@/lib/coreedge/capability-registry";

const target = join(process.cwd(), "docs", "coreedge", "capability-registry.json");
const next = serializeCapabilityRegistry();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    current = "";
  }
  if (current !== next) {
    console.error(
      "docs/coreedge/capability-registry.json is stale: the code's capabilities changed. Run `pnpm coreedge:registry`, then `pnpm coreedge:figures` to re-quote the roadmap, and commit both.",
    );
    process.exit(1);
  }
  console.log("capability-registry.json matches the code.");
} else {
  writeFileSync(target, next);
  console.log(`Wrote ${target}`);
}
