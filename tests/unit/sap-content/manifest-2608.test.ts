/**
 * 2608 WS0 — the landed drop is what MANIFEST.json says it is.
 *
 * This is the integrity half of scripts/recon-2608.ts run as a unit test, so a
 * PR that touches a file under sap-references/2608/ without updating the
 * manifest (or vice versa) fails CI. The facts half (679 / 4,328 / 19,158 …)
 * stays in the script: it parses three large workbooks and belongs to the
 * RECON gate, not the unit suite.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadManifest, manifestSha256, verifyManifest } from "../../../scripts/lib/manifest-2608";
import { BDC_2608, BPD_2608_SCOPE_ITEMS, sapContentSourcesFor } from "../../../scripts/lib/sap-content-sources";

const ROOT = process.cwd();
const SOURCES = sapContentSourcesFor("2608");
const DROP = SOURCES.dropDir!;
const MANIFEST = SOURCES.manifest!;

describe("sap-references/2608 · MANIFEST.json", () => {
  it("exists and names release 2608 · MY", () => {
    expect(existsSync(join(ROOT, MANIFEST))).toBe(true);
    const m = loadManifest(MANIFEST, ROOT);
    expect(m.release).toBe("2608");
    expect(m.localisation).toBe("MY");
    expect(m.files.length).toBeGreaterThan(0);
  });

  it("every listed file is present with the recorded sha256 + bytes; nothing unlisted; no zips", () => {
    const m = loadManifest(MANIFEST, ROOT);
    const r = verifyManifest(m, DROP, ROOT);
    expect(r.findings, r.findings.join("\n")).toEqual([]);
    expect(r.verified).toBe(m.files.length);
  });

  it("every entry carries a structural row count (spreadsheets) or null (other files)", () => {
    const m = loadManifest(MANIFEST, ROOT);
    for (const f of m.files) {
      expect(f, f.file).toHaveProperty("rows");
      if (/\.xls[xm]$/i.test(f.file)) {
        expect(typeof f.rows, f.file).toBe("number");
        expect(f.sheets && Object.keys(f.sheets).length, f.file).toBeGreaterThan(0);
      } else {
        expect(f.rows, f.file).toBeNull();
      }
    }
  });

  it("lists the source map's files: A&D, SSCUI, Process-Steps, 16+1 questionnaires, 9 BPD pairs", () => {
    const listed = new Set(loadManifest(MANIFEST, ROOT).files.map((f) => f.file));
    expect(listed.has(SOURCES.scopeItems!.file)).toBe(true);
    expect(listed.has(SOURCES.sscui!.file)).toBe(true);
    expect(listed.has(SOURCES.processSteps!.file)).toBe(true);
    for (const q of BDC_2608) expect(listed.has(q.file), q.id).toBe(true);
    expect(BDC_2608.filter((q) => q.id !== "S4H_1613")).toHaveLength(16);
    expect(BPD_2608_SCOPE_ITEMS).toHaveLength(9);
    for (const b of SOURCES.bpd) {
      expect(listed.has(b.docx), b.scopeItemCode).toBe(true);
      expect(listed.has(b.xlsx), b.scopeItemCode).toBe(true);
    }
  });
});

describe("sap-references/2608 · RELEASE.json", () => {
  const record = JSON.parse(readFileSync(join(ROOT, DROP, "RELEASE.json"), "utf8")) as {
    release: string;
    supersedes: string;
    localisation: string;
    status: string;
    manifest: { path: string; sha256: string | null; fileCount: number };
  };

  it("is the LANDED version record for 2608 superseding 2602", () => {
    expect(record.release).toBe("2608");
    expect(record.supersedes).toBe("2602");
    expect(record.localisation).toBe("MY");
    expect(record.status).toBe("LANDED");
  });

  it("pins the sha256 of the current MANIFEST.json (stale record = failing test)", () => {
    expect(record.manifest.path).toBe(MANIFEST);
    expect(record.manifest.sha256).toBe(manifestSha256(MANIFEST, ROOT));
    expect(record.manifest.fileCount).toBe(loadManifest(MANIFEST, ROOT).files.length);
  });
});
