/**
 * ABeam Workbench — C10 library health inputs.
 *
 * Every number here is computed or read from the committed MANIFEST. Nothing is
 * a literal. The .dc hardcodes "654", `|| 7` gap fallbacks, a "2602" release
 * literal, and three invented audit rows attributed to a real person — an audit
 * trail that lies is worse than none, so this ships with no audit list at all
 * until there is a real one to show (D16).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { coverageCounts } from "@/lib/discovery/client-library";
import { ManifestSchema, type Manifest } from "@/lib/discovery/schema";
import { apqcCoverage, derivedGapCategories, libraryRows } from "./library";

let manifestCache: Manifest | null = null;

export function manifest(): Manifest {
  if (manifestCache) return manifestCache;
  manifestCache = ManifestSchema.parse(
    JSON.parse(readFileSync(join(process.cwd(), "src/data/discovery/MANIFEST.json"), "utf8")),
  );
  return manifestCache;
}

export interface LibraryHealth {
  processes: number;
  withFlow: number;
  noFlow: number;
  flowShare: number;
  completeness: { detailed: number; detailedVariants: number; outline: number; none: number };
  origin: { sapBase: number; overlay: number };
  gapCategories: number;
  apqcCategories: number;
  /** Days since the MANIFEST was generated — the honest staleness signal. */
  generated: string;
  ageDays: number;
  stale: boolean;
  hashes: Record<string, string>;
  hashAlgorithm: string;
  source: string;
}

/** Brief C10 has a "stale-release warning" state; 180 days is the trigger. */
const STALE_AFTER_DAYS = 180;

export function libraryHealth(now: Date = new Date()): LibraryHealth {
  const m = manifest();
  const rows = libraryRows();
  const cov = coverageCounts();

  const generated = new Date(m.generated);
  const ageDays = Math.max(0, Math.floor((now.getTime() - generated.getTime()) / 86_400_000));

  const tally = (v: string | null) => rows.filter((r) => r.completeness === v).length;

  return {
    processes: cov.processes,
    withFlow: cov.withFlow,
    noFlow: cov.noFlow,
    flowShare: cov.processes > 0 ? cov.withFlow / cov.processes : 0,
    completeness: {
      detailed: tally("detailed"),
      detailedVariants: tally("detailed+variants"),
      outline: tally("outline"),
      none: tally(null),
    },
    origin: {
      sapBase: rows.filter((r) => r.origin === "sap-base").length,
      overlay: rows.filter((r) => r.origin === "overlay").length,
    },
    gapCategories: derivedGapCategories().length,
    apqcCategories: apqcCoverage().length,
    generated: m.generated,
    ageDays,
    stale: ageDays > STALE_AFTER_DAYS,
    hashes: m.files,
    hashAlgorithm: m.hash_algorithm,
    source: m.source,
  };
}
