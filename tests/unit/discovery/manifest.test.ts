/**
 * ABeam Workbench — Neutral Process Discovery MANIFEST integrity guard.
 *
 * MANIFEST.json is the SOLE authority for dataset counts (D1: the datasets'
 * own `meta` blocks are informational, and consultant meta.completeness is
 * known-stale). This test asserts three things:
 *
 *   1. The pinned hashes below match MANIFEST — catches a silent swap of data
 *      AND manifest together.
 *   2. MANIFEST's hashes match the actual bytes on disk — catches data drift.
 *   3. MANIFEST's counts match the actual parsed data — catches content drift.
 *
 * Why (1) is not redundant: during the build, the datasets and the MANIFEST were
 * replaced together mid-session. Every count still matched and the hashes were
 * still self-consistent — a counts-only or self-consistency-only guard would
 * have passed straight through it. Only a pinned expectation catches that.
 *
 * The data is FROZEN. The next legitimate change is a post-pilot refresh
 * arriving as its own data-only PR, which updates MANIFEST and these constants
 * in the same commit. If this test fails and no such PR is in flight, treat it
 * as a failure and stop — do not "fix" it by re-pinning.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { allClientProcesses, clientValueStreams } from "@/lib/discovery/client-library";
import { allConsultantProcesses } from "@/lib/discovery/consultant-library";
import { ManifestSchema } from "@/lib/discovery/schema";

const DATA_DIR = join(process.cwd(), "src/data/discovery");

/**
 * MANIFEST records 16 hex chars. That is sha256 truncated to 16 — the algorithm
 * is NOT recorded in the file itself, so it is hardcoded here deliberately.
 */
const HASH_ALGO = "sha256";
const HASH_LENGTH = 16;

/** The pinned, canonical pipeline output. See BUILD-LOG.md "Data is FROZEN". */
const PINNED_HASHES: Record<string, string> = {
  "discovery-library.client.json": "71d5a13aa7ca59de",
  "discovery-library.consultant.json": "626f605fc732f494",
  "vendor-term-guard.json": "57749b0be400c9e2",
};

function hashOf(file: string): string {
  return createHash(HASH_ALGO)
    .update(readFileSync(join(DATA_DIR, file)))
    .digest("hex")
    .slice(0, HASH_LENGTH);
}

function loadManifest() {
  return ManifestSchema.parse(JSON.parse(readFileSync(join(DATA_DIR, "MANIFEST.json"), "utf8")));
}

describe("discovery MANIFEST integrity", () => {
  const manifest = loadManifest();

  it("MANIFEST hashes match the pinned canonical values", () => {
    expect(manifest.files).toEqual(PINNED_HASHES);
  });

  it("every dataset on disk matches its MANIFEST hash", () => {
    for (const [file, expected] of Object.entries(manifest.files)) {
      expect(hashOf(file), `${file} drifted from its MANIFEST hash`).toBe(expected);
    }
  });

  it("MANIFEST covers every dataset we pin", () => {
    expect(Object.keys(manifest.files).sort()).toEqual(Object.keys(PINNED_HASHES).sort());
  });
});

describe("discovery MANIFEST counts vs actual data", () => {
  const manifest = loadManifest();
  const processes = allClientProcesses();

  it("processes: 742", () => {
    expect(processes.length).toBe(manifest.counts.processes);
  });

  it("value streams: 10", () => {
    expect(clientValueStreams().length).toBe(manifest.counts.value_streams);
  });

  it("workflows: 85", () => {
    const workflows = clientValueStreams().reduce((n, vs) => n + vs.workflows.length, 0);
    expect(workflows).toBe(manifest.counts.workflows);
  });

  it("with_flow: 726", () => {
    const withFlow = processes.filter((p) => (p.flow?.length ?? 0) > 0).length;
    expect(withFlow).toBe(manifest.counts.with_flow);
  });

  it("with_substeps: 400", () => {
    const withSubsteps = processes.filter((p) =>
      (p.flow ?? []).some((s) => (s.substeps?.length ?? 0) > 0),
    ).length;
    expect(withSubsteps).toBe(manifest.counts.with_substeps);
  });

  it("origin split: 654 sap-base / 88 overlay", () => {
    const consultant = allConsultantProcesses();
    const sapBase = consultant.filter((p) => p.origin === "sap-base").length;
    const overlay = consultant.filter((p) => p.origin === "overlay").length;
    expect({ sapBase, overlay }).toEqual({
      sapBase: manifest.counts.origin.sap_base,
      overlay: manifest.counts.origin.overlay,
    });
  });

  it("parked vendor enablers: 18 (consultant dataset only)", () => {
    expect(loadManifest().counts.parked_sap_enablers).toBe(18);
  });

  it("MANIFEST asserts the client dataset has zero vendor leaks", () => {
    expect(manifest.client_dataset_vendor_leaks).toBe(0);
  });
});

describe("D1 — dataset meta is never trusted for counts", () => {
  it("consultant meta.completeness is still stale, and that is fine", () => {
    // Documents the known remnant. If a future pipeline refresh fixes this, the
    // test tells us — it does not mean anything is broken. MANIFEST remains the
    // authority either way; nothing reads counts out of meta.
    const raw = JSON.parse(
      readFileSync(join(DATA_DIR, "discovery-library.consultant.json"), "utf8"),
    ) as { meta: { completeness?: Record<string, number> } };

    const actual = allClientProcesses().reduce<Record<string, number>>((acc, p) => {
      if (p.completeness) acc[p.completeness] = (acc[p.completeness] ?? 0) + 1;
      return acc;
    }, {});

    expect(actual).toEqual({ detailed: 223, "detailed+variants": 177, outline: 326 });
    expect(raw.meta.completeness).toEqual({ detailed: 155, "detailed+variants": 177, outline: 306 });
  });
});
