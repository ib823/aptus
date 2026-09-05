/**
 * MANIFEST.json helpers for a landed SAP content drop (2608 WS0).
 *
 * The manifest is the consultant's record of what was downloaded (file,
 * bytes, sha256, source, downloaded date). These helpers verify the folder
 * against it and compute per-workbook row counts straight from the xlsx/xlsm
 * package XML — no spreadsheet library, so a workbook a parser chokes on still
 * gets counted, and the count is structural (rows that exist in the sheet),
 * not a parser's opinion.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import AdmZip from "adm-zip";

export type ManifestFile = {
  file: string; // repo-relative, e.g. "sap-references/2608/…xlsx"
  bytes: number;
  sha256: string;
  source?: string;
  downloaded?: string;
  /** Structural row count summed over all worksheets (null for non-spreadsheets). */
  rows?: number | null;
  /** Per-worksheet structural row counts. */
  sheets?: Record<string, number>;
};

export type Manifest = {
  release: string;
  localisation: string;
  generated: string;
  files: ManifestFile[];
};

export type IntegrityResult = {
  ok: boolean;
  verified: number;
  missing: string[];
  mismatched: string[];
  unlisted: string[];
  zips: string[];
  findings: string[];
};

/**
 * Repo-authored files that live in the drop folder but are NOT SAP downloads and
 * so are not in MANIFEST.json: the manifest itself, the release record, the
 * README, and the transcribed lifecycle list (WS1). Anything else in the folder
 * must be in the manifest.
 */
export const REPO_AUTHORED_SIDECARS = [
  "MANIFEST.json",
  "RELEASE.json",
  "README.md",
  "scope-lifecycle-2608.json",
  "bdc-questionnaires.json",
] as const;
const SKIP_IN_DROP = new Set<string>(REPO_AUTHORED_SIDECARS);

export function sha256File(abs: string): string {
  return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

export function loadManifest(relPath: string, cwd = process.cwd()): Manifest {
  const raw = fs.readFileSync(path.resolve(cwd, relPath), "utf8");
  const parsed = JSON.parse(raw) as Partial<Manifest>;
  if (!Array.isArray(parsed.files)) throw new Error(`${relPath}: "files" must be an array`);
  return {
    release: String(parsed.release ?? ""),
    localisation: String(parsed.localisation ?? ""),
    generated: String(parsed.generated ?? ""),
    files: parsed.files as ManifestFile[],
  };
}

export function manifestSha256(relPath: string, cwd = process.cwd()): string {
  return sha256File(path.resolve(cwd, relPath));
}

export function walkDrop(dropDir: string, cwd = process.cwd()): string[] {
  const root = path.resolve(cwd, dropDir);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(path.relative(cwd, abs).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}

/** Every manifest file present with matching bytes + sha256; nothing unlisted; no zips. */
export function verifyManifest(manifest: Manifest, dropDir: string, cwd = process.cwd()): IntegrityResult {
  const listed = new Set(manifest.files.map((f) => f.file));
  const missing: string[] = [];
  const mismatched: string[] = [];
  let verified = 0;
  for (const f of manifest.files) {
    const abs = path.resolve(cwd, f.file);
    if (!fs.existsSync(abs)) {
      missing.push(f.file);
      continue;
    }
    const bytes = fs.statSync(abs).size;
    const hash = sha256File(abs);
    if (bytes !== f.bytes || hash !== f.sha256) mismatched.push(f.file);
    else verified++;
  }
  const onDisk = walkDrop(dropDir, cwd).filter((p) => !SKIP_IN_DROP.has(path.posix.basename(p)));
  const zips = onDisk.filter((p) => p.toLowerCase().endsWith(".zip"));
  const unlisted = onDisk.filter((p) => !listed.has(p) && !zips.includes(p));

  const findings: string[] = [];
  if (missing.length) findings.push(`${missing.length} manifest file(s) missing on disk`);
  if (mismatched.length) findings.push(`${mismatched.length} file(s) differ from MANIFEST.json (sha256/bytes)`);
  if (unlisted.length) findings.push(`${unlisted.length} file(s) in the drop not listed in MANIFEST.json`);
  if (zips.length) findings.push(`${zips.length} zip(s) in the drop — unpack and remove them`);
  if (manifest.files.length === 0) findings.push("MANIFEST.json lists no files");
  return { ok: findings.length === 0, verified, missing, mismatched, unlisted, zips, findings };
}

const SPREADSHEET_EXT = new Set([".xlsx", ".xlsm"]);

export function isSpreadsheet(file: string): boolean {
  return SPREADSHEET_EXT.has(path.posix.extname(file).toLowerCase());
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/**
 * Structural row counts per worksheet, read from the OOXML package:
 * workbook.xml names the sheets, workbook.xml.rels maps them to parts, and
 * each sheet part's `<row …>` elements are counted.
 */
export function workbookRowCounts(absPath: string): Record<string, number> {
  const zip = new AdmZip(absPath);
  const read = (name: string): string | null => {
    const e = zip.getEntry(name);
    return e ? e.getData().toString("utf8") : null;
  };
  const workbook = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error(`${absPath}: not an OOXML workbook`);

  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (id && target) relTargets.set(id, target);
  }

  const counts: Record<string, number> = {};
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1] ?? /\bid="([^"]+)"/.exec(tag)?.[1];
    if (!name || !rid) continue;
    const target = relTargets.get(rid);
    if (!target) continue;
    const part = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const xml = read(part);
    if (xml === null) continue;
    counts[decodeXml(name).trim()] = (xml.match(/<row\b/g) ?? []).length;
  }
  return counts;
}

export function fileRowCounts(
  file: string,
  cwd = process.cwd(),
): { rows: number | null; sheets?: Record<string, number> } {
  if (!isSpreadsheet(file)) return { rows: null };
  const sheets = workbookRowCounts(path.resolve(cwd, file));
  const rows = Object.values(sheets).reduce((n, v) => n + v, 0);
  return { rows, sheets };
}

export function writeManifest(relPath: string, manifest: Manifest, cwd = process.cwd()): void {
  fs.writeFileSync(path.resolve(cwd, relPath), JSON.stringify(manifest, null, 1) + "\n");
}
