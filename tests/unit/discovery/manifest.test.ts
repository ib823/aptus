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
 * sha256 truncated to 16 hex chars. The MANIFEST now records this itself in
 * `hash_algorithm`, but it stays hardcoded here on purpose: a manifest that
 * declared its own algorithm AND was trusted to could be swapped wholesale.
 * The test asserts the two agree.
 */
const HASH_ALGO = "sha256";
const HASH_LENGTH = 16;
const HASH_ALGO_DECLARED = "sha256 truncated to 16 hex chars";

/**
 * The pinned, canonical pipeline output. See BUILD-LOG.md "Data is FROZEN".
 * Re-pinned 2026-07-17 for the data-only re-emission that removed the 181
 * sentinel flows (see D6).
 */
const PINNED_HASHES: Record<string, string> = {
  "discovery-library.client.json": "35f9efe4e8ce7bfd",
  "discovery-library.consultant.json": "31feb5416252f702",
  "vendor-term-guard.json": "13c982041670dae7",
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

  it("the MANIFEST's declared algorithm matches the one we hardcode", () => {
    expect(manifest.hash_algorithm).toBe(HASH_ALGO_DECLARED);
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

  it("with_flow: 545", () => {
    const withFlow = processes.filter((p) => (p.flow?.length ?? 0) > 0).length;
    expect(withFlow).toBe(manifest.counts.with_flow);
    expect(withFlow).toBe(545);
  });

  it("no_flow: 197 — and with_flow + no_flow accounts for every process", () => {
    const noFlow = processes.filter((p) => (p.flow?.length ?? 0) === 0).length;
    expect(noFlow).toBe(manifest.counts.no_flow);
    expect(noFlow).toBe(197);
    expect(manifest.counts.with_flow + manifest.counts.no_flow).toBe(manifest.counts.processes);
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

  it("if MANIFEST self-declares a leak count, it must be zero", () => {
    // The re-emission dropped this field, and that is an improvement. It was
    // self-attestation: the old MANIFEST declared `client_dataset_vendor_leaks:
    // 0` and was correct *by its own guard list*, while 181 SAP-localisation
    // sentinel strings sat in the client data (D6). A dataset cannot certify
    // itself. The authority is the live scan in vendor-terms.test.ts, which
    // greps the real bytes against the real term list.
    if (manifest.client_dataset_vendor_leaks !== undefined) {
      expect(manifest.client_dataset_vendor_leaks).toBe(0);
    }
  });
});

describe("D1 — dataset meta is never trusted for counts", () => {
  /**
   * The 2026-07-17 re-emission made meta consistent with actuals, so D1's
   * original remnant (stale consultant completeness) is gone. The STANCE still
   * stands: meta is informational, MANIFEST is the authority, and nothing in the
   * codebase reads a count from meta — enforced by typing meta as `unknown` in
   * the schema. This test now pins the agreement rather than the discrepancy, so
   * if meta ever drifts again we hear about it here.
   */
  it("consultant meta.with_flow now agrees with the actual data", () => {
    const raw = JSON.parse(
      readFileSync(join(DATA_DIR, "discovery-library.consultant.json"), "utf8"),
    ) as { meta: { with_flow?: number } };

    const actualWithFlow = allClientProcesses().filter((p) => (p.flow?.length ?? 0) > 0).length;
    expect(raw.meta.with_flow).toBe(actualWithFlow);
    expect(actualWithFlow).toBe(545);
  });
});
