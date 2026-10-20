/**
 * Which files the document lint reads (roadmap P0.16), and the walk over them.
 *
 * The CoreEdge documents a developer or an auditor reads, and the comments in
 * the CoreEdge code that explain what it does. Imported by
 * scripts/coreedge/check-doc-claims.ts and its test only; it reads the disk.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { checkDocument, docKind, type MarkerProblem, type StaleClaim } from "./doc-claims";
import type { DocumentedFeature } from "./shipped-features";

/** Directories read whole (recursively), and single files, relative to the repository root. */
export const DOC_CLAIMS_SCOPE = {
  directories: [
    "docs/coreedge",
    "docs/runbooks",
    "docs/adr",
    // The comments in the CoreEdge code.
    "src/app/(coreedge)",
    "src/app/(studio)",
    "src/app/(control-tower)",
    "src/app/(operations)",
    "src/app/api/coreedge",
    "src/app/api/northbound",
    "src/app/api/studio",
    "src/components/coreedge",
    "src/components/studio",
    "src/components/control-tower",
    "src/lib/coreedge",
    "src/lib/northbound",
    "src/lib/studio",
  ],
  /** docs/coreedge-*.md at the top of docs/, plus these. */
  topLevelDocPrefix: "docs/coreedge-",
  files: ["README.md", "SECURITY.md", "docs/deployment-urls.md"],
  /**
   * Never read: this lint's own vocabulary, and the registry, whose cell
   * notes say what is not built on purpose (they are scored, not prose).
   */
  exclude: [
    "src/lib/coreedge/doc-claims.ts",
    "src/lib/coreedge/doc-claims-scope.ts",
    "src/lib/coreedge/shipped-features.ts",
    "src/lib/coreedge/capability-registry.ts",
  ],
} as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const toPosix = (p: string) => p.split(sep).join("/");

/** Every file in scope, repository-relative with forward slashes, sorted. */
export function docClaimsFiles(root: string): string[] {
  const out = new Set<string>();
  for (const dir of DOC_CLAIMS_SCOPE.directories) {
    const full = join(root, dir);
    if (existsSync(full)) for (const f of walk(full)) out.add(toPosix(relative(root, f)));
  }
  const docs = join(root, "docs");
  if (existsSync(docs)) {
    for (const name of readdirSync(docs)) {
      const rel = `docs/${name}`;
      if (rel.startsWith(DOC_CLAIMS_SCOPE.topLevelDocPrefix) && statSync(join(docs, name)).isFile()) out.add(rel);
    }
  }
  for (const f of DOC_CLAIMS_SCOPE.files) if (existsSync(join(root, f))) out.add(f);
  const excluded = new Set<string>(DOC_CLAIMS_SCOPE.exclude);
  return [...out].filter((f) => !excluded.has(f) && docKind(f) !== null && !f.endsWith(".d.ts")).sort();
}

export interface ScanResult {
  readonly claims: StaleClaim[];
  readonly problems: MarkerProblem[];
  readonly historical: string[];
}

export function scanDocuments(
  root: string,
  files: readonly string[],
  shipped: readonly DocumentedFeature[],
  allFeatureIds: ReadonlySet<string>,
): ScanResult {
  const result: ScanResult = { claims: [], problems: [], historical: [] };
  for (const file of files) {
    const r = checkDocument(file, readFileSync(join(root, file), "utf8"), shipped, allFeatureIds);
    result.claims.push(...r.claims);
    result.problems.push(...r.problems);
    if (r.historical) result.historical.push(file);
  }
  return result;
}
