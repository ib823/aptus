/**
 * The document lint (roadmap P0.16).
 *
 *   pnpm coreedge:doc-claims            # list stale claims; exit 1 if any
 *   pnpm coreedge:doc-claims --list     # also print the shipped features it checks
 *
 * Fails on any sentence or table row in the CoreEdge documents (and in the
 * comments of the CoreEdge code) that puts a feature the capability registry
 * marks shipped next to "planned", "not yet built", "coming soon" or the like.
 * Also fails when a feature's code anchor (a module and its exports, in
 * src/lib/coreedge/shipped-features.ts) no longer exists, and on a malformed
 * marker. CI runs it in Quality Gates; tests/unit/coreedge/doc-claims.test.ts
 * runs the same check inside `pnpm test`.
 *
 * What to do with a finding: docs/runbooks/coreedge-doc-claims.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCapabilityRegistry } from "@/lib/coreedge/capability-registry";
import { scanDocuments, docClaimsFiles } from "@/lib/coreedge/doc-claims-scope";
import { DOCUMENTED_FEATURES, featureStatuses, missingExports } from "@/lib/coreedge/shipped-features";

const root = process.cwd();
const statuses = featureStatuses(buildCapabilityRegistry());

let failed = false;

for (const { feature } of statuses) {
  const path = join(root, feature.code.file);
  if (!existsSync(path)) {
    console.error(`shipped-features.ts: "${feature.id}" names ${feature.code.file}, which does not exist.`);
    failed = true;
    continue;
  }
  const missing = missingExports(feature.code, readFileSync(path, "utf8"));
  if (missing.length) {
    console.error(
      `shipped-features.ts: "${feature.id}" names ${missing.join(", ")} in ${feature.code.file}, no longer exported.`,
    );
    failed = true;
  }
}

if (process.argv.includes("--list")) {
  for (const s of statuses) {
    console.log(
      `${s.shipped ? "shipped    " : "not shipped"}  ${s.feature.id.padEnd(20)} ${s.cells.map((c) => `${c.key}=${c.status}`).join(", ")}`,
    );
  }
}

const files = docClaimsFiles(root);
const result = scanDocuments(
  root,
  files,
  statuses.filter((s) => s.shipped).map((s) => s.feature),
  new Set(DOCUMENTED_FEATURES.map((f) => f.id)),
);

for (const p of result.problems) {
  console.error(`${p.file}:${p.line}: ${p.message}`);
  failed = true;
}
for (const c of result.claims) {
  console.error(
    `${c.file}:${c.line}: "${c.term}" (${c.featureId}, shipped) is next to "${c.wording}":\n    ${c.text.length > 240 ? `${c.text.slice(0, 237)}...` : c.text}`,
  );
  failed = true;
}

if (failed) {
  console.error(
    "\nA document says a shipped feature is not built. Correct the sentence, or, if it is right as it stands, mark it (docs/runbooks/coreedge-doc-claims.md).",
  );
  process.exit(1);
}
console.log(
  `Documents match the code: ${files.length} files checked (${result.historical.length} historical, skipped), ${statuses.filter((s) => s.shipped).length} shipped features.`,
);
