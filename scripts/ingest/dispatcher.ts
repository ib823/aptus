/**
 * SAP Best Practices ingest dispatcher.
 *
 * Detects the archive layout and routes to the right adapter. Supports:
 *   - Public Edition: `S4C/Library/...` + `*_S4CLD{YEAR}_BPD_*` filenames
 *   - Private Edition: `S4O/Library/...` + `*_S4HANA{YEAR}-FPS{N}_BPD_*`
 *
 * Usage:
 *   $ tsx scripts/ingest/dispatcher.ts <path-to-zip>
 */

import AdmZip from "adm-zip";
import { runPrivateIngest } from "./private-adapter";

type Edition = "PUBLIC" | "PRIVATE";

function detectEdition(zipPath: string): Edition {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  let hasPublicLayout = false;
  let hasPrivateLayout = false;
  for (const e of entries) {
    if (e.isDirectory) continue;
    if (e.entryName.startsWith("S4C/Library/")) hasPublicLayout = true;
    if (e.entryName.startsWith("S4O/Library/")) hasPrivateLayout = true;
    if (hasPublicLayout && hasPrivateLayout) break;
  }

  if (hasPublicLayout && !hasPrivateLayout) return "PUBLIC";
  if (hasPrivateLayout && !hasPublicLayout) return "PRIVATE";
  if (hasPublicLayout && hasPrivateLayout) {
    throw new Error(
      "Archive contains both S4C/Library/ and S4O/Library/ — ambiguous edition. Aborting.",
    );
  }
  throw new Error(
    "Archive does not match SAP Best Practices layout (no S4C/Library/ or S4O/Library/ directory).",
  );
}

export async function dispatch(zipPath: string): Promise<void> {
  const edition = detectEdition(zipPath);
  console.log(`[dispatcher] Detected edition: ${edition}`);

  if (edition === "PRIVATE") {
    await runPrivateIngest(zipPath);
    return;
  }

  // Public path: defer to the existing scripts/ingest-sap-zip.ts via a dynamic import.
  // Keeping the original script intact preserves the working production ingest path
  // while we incrementally migrate Public into this directory.
  console.log("[dispatcher] Routing to existing public ingest script (scripts/ingest-sap-zip.ts).");
  console.log("[dispatcher] Run: pnpm tsx scripts/ingest-sap-zip.ts " + zipPath);
  throw new Error(
    "Public edition dispatch not yet integrated. Run scripts/ingest-sap-zip.ts directly.",
  );
}

if (process.argv[1] && process.argv[1].endsWith("dispatcher.ts")) {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Usage: tsx scripts/ingest/dispatcher.ts <path-to-zip>");
    process.exit(1);
  }
  dispatch(zipPath).catch((err) => {
    console.error("[dispatcher] Failed:", err);
    process.exit(1);
  });
}
