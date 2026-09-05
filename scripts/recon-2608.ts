/**
 * RECON — SAP S/4HANA Cloud 2608 reference drop.
 *
 * Reconciles what is physically in `sap-references/2608/` against the release
 * record `sap-references/2608/RELEASE.json` and prints a RECON report. Nothing
 * here reads SAP content; it only proves the drop is complete, unpacked, and
 * identical to what the manifest claims.
 *
 * Usage:
 *   pnpm sap:2608:recon            report only; non-zero exit on any finding
 *   pnpm sap:2608:recon --write    record the on-disk state as the new baseline
 *   pnpm sap:2608:recon --json     machine-readable report on stdout
 *
 * Exit codes:
 *   0  drop matches RELEASE.json (or --write recorded it)
 *   1  findings: zips present, empty drop, files added/removed/changed vs manifest
 *   2  RELEASE.json missing or unreadable
 *
 * Node-only (fs/crypto/path). Runs under tsx or `node --experimental-strip-types`.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const RELEASE = "2608";
const DROP_DIR = path.resolve(process.cwd(), "sap-references", RELEASE);
const MANIFEST_PATH = path.join(DROP_DIR, "RELEASE.json");
const MANIFEST_NAME = path.basename(MANIFEST_PATH);
const README_NAME = "README.md";

type FileEntry = { path: string; bytes: number; sha256: string };

type Manifest = {
  release: string;
  releaseVersion: string;
  supersedes?: string | undefined;
  status: "PENDING" | "LANDED";
  statusNote?: string | undefined;
  source?: { folder?: string; packaging?: string } | undefined;
  landedAt: string | null;
  recon: { script: string; lastRunAt: string | null; fileCount: number; totalBytes: number };
  files: FileEntry[];
};

type Report = {
  release: string;
  releaseVersion: string;
  status: Manifest["status"];
  dropDir: string;
  onDisk: { fileCount: number; totalBytes: number };
  manifest: { fileCount: number; totalBytes: number };
  zips: string[];
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
  findings: string[];
  ok: boolean;
};

function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, base));
    } else if (entry.isFile()) {
      out.push(path.relative(base, abs).split(path.sep).join("/"));
    }
  }
  return out.sort();
}

function sha256(abs: string): string {
  return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

function loadManifest(): Manifest {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<Manifest>;
  if (parsed.release !== RELEASE) {
    throw new Error(`${MANIFEST_NAME} names release ${String(parsed.release)}, expected ${RELEASE}`);
  }
  return {
    release: RELEASE,
    releaseVersion: parsed.releaseVersion ?? `${RELEASE}.0`,
    supersedes: parsed.supersedes,
    status: parsed.status === "LANDED" ? "LANDED" : "PENDING",
    statusNote: parsed.statusNote,
    source: parsed.source,
    landedAt: parsed.landedAt ?? null,
    recon: parsed.recon ?? { script: "scripts/recon-2608.ts", lastRunAt: null, fileCount: 0, totalBytes: 0 },
    files: Array.isArray(parsed.files) ? parsed.files : [],
  };
}

function scan(): { entries: FileEntry[]; zips: string[] } {
  const entries: FileEntry[] = [];
  const zips: string[] = [];
  for (const rel of walk(DROP_DIR)) {
    if (rel === MANIFEST_NAME || rel === README_NAME) continue;
    if (rel.toLowerCase().endsWith(".zip")) {
      zips.push(rel);
      continue;
    }
    const abs = path.join(DROP_DIR, rel);
    entries.push({ path: rel, bytes: fs.statSync(abs).size, sha256: sha256(abs) });
  }
  return { entries, zips };
}

function reconcile(manifest: Manifest, onDisk: FileEntry[], zips: string[]): Report {
  const before = new Map(manifest.files.map((f) => [f.path, f]));
  const after = new Map(onDisk.map((f) => [f.path, f]));

  const added = [...after.keys()].filter((p) => !before.has(p));
  const removed = [...before.keys()].filter((p) => !after.has(p));
  const changed = [...after.keys()].filter((p) => {
    const prev = before.get(p);
    return prev !== undefined && (prev.sha256 !== after.get(p)!.sha256 || prev.bytes !== after.get(p)!.bytes);
  });
  const unchanged = onDisk.length - added.length - changed.length;

  const findings: string[] = [];
  if (zips.length > 0) findings.push(`${zips.length} zip(s) in the drop — unpack and remove them`);
  if (onDisk.length === 0) findings.push("drop is empty — no 2608 files have been landed");
  if (added.length > 0) findings.push(`${added.length} file(s) on disk not in ${MANIFEST_NAME}`);
  if (removed.length > 0) findings.push(`${removed.length} file(s) in ${MANIFEST_NAME} missing on disk`);
  if (changed.length > 0) findings.push(`${changed.length} file(s) differ from ${MANIFEST_NAME} (hash/size)`);
  if (manifest.status === "PENDING" && onDisk.length > 0 && findings.length === 0) {
    findings.push("manifest status is PENDING but files are recorded — run with --write");
  }

  const sum = (list: FileEntry[]) => list.reduce((n, f) => n + f.bytes, 0);
  return {
    release: manifest.release,
    releaseVersion: manifest.releaseVersion,
    status: manifest.status,
    dropDir: path.relative(process.cwd(), DROP_DIR),
    onDisk: { fileCount: onDisk.length, totalBytes: sum(onDisk) },
    manifest: { fileCount: manifest.files.length, totalBytes: sum(manifest.files) },
    zips,
    added,
    removed,
    changed,
    unchanged,
    findings,
    ok: findings.length === 0,
  };
}

function writeManifest(manifest: Manifest, onDisk: FileEntry[], now: string): Manifest {
  const next: Manifest = {
    ...manifest,
    status: onDisk.length > 0 ? "LANDED" : "PENDING",
    landedAt: onDisk.length > 0 ? (manifest.landedAt ?? now) : null,
    recon: {
      script: "scripts/recon-2608.ts",
      lastRunAt: now,
      fileCount: onDisk.length,
      totalBytes: onDisk.reduce((n, f) => n + f.bytes, 0),
    },
    files: onDisk,
  };
  if (next.status === "LANDED") delete next.statusNote;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(next, null, 2) + "\n");
  return next;
}

function printHuman(r: Report, wrote: boolean): void {
  const list = (label: string, items: string[]) => {
    if (items.length === 0) return;
    console.log(`  ${label} (${items.length}):`);
    for (const item of items.slice(0, 50)) console.log(`    - ${item}`);
    if (items.length > 50) console.log(`    … ${items.length - 50} more`);
  };
  console.log(`RECON 2608 — release ${r.releaseVersion} — status ${r.status}${wrote ? " (manifest written)" : ""}`);
  console.log(`  drop:      ${r.dropDir}/`);
  console.log(`  on disk:   ${r.onDisk.fileCount} file(s), ${r.onDisk.totalBytes} bytes`);
  console.log(`  manifest:  ${r.manifest.fileCount} file(s), ${r.manifest.totalBytes} bytes`);
  console.log(`  unchanged: ${r.unchanged}`);
  list("added", r.added);
  list("removed", r.removed);
  list("changed", r.changed);
  list("zips", r.zips);
  if (r.findings.length === 0) {
    console.log("  result:    OK — drop matches RELEASE.json");
  } else {
    console.log("  findings:");
    for (const f of r.findings) console.log(`    ! ${f}`);
    console.log(`  result:    ${wrote ? "RECORDED with findings above" : "DRIFT"}`);
  }
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const json = args.has("--json");

  let manifest: Manifest;
  try {
    manifest = loadManifest();
  } catch (err) {
    console.error(`RECON 2608 — cannot read ${path.relative(process.cwd(), MANIFEST_PATH)}: ${(err as Error).message}`);
    return 2;
  }

  const { entries, zips } = scan();
  const now = new Date().toISOString();

  let report = reconcile(manifest, entries, zips);
  let wrote = false;
  if (write && zips.length === 0) {
    const next = writeManifest(manifest, entries, now);
    report = reconcile(next, entries, zips);
    wrote = true;
  } else if (write && zips.length > 0) {
    report.findings.unshift("--write refused: remove zips from the drop first");
  }

  if (json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report, wrote);

  return report.ok ? 0 : 1;
}

process.exitCode = main();
