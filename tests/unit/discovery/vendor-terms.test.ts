/**
 * ABeam Workbench — Neutral Process Discovery vendor-term guard (INVARIANT 1).
 *
 * No vendor term may appear in any client-facing route, component, dataset, or
 * export. This is one of the two enforcement mechanisms; the other is the
 * serializer allowlist (src/lib/discovery/serializers.ts). Both, deliberately —
 * the grep catches hardcoded copy, the allowlist catches data fields.
 *
 * Reader note: the scan reads whole files and matches with a global regex rather
 * than shelling out to grep. Plain grep hangs on the minified .dc design
 * contracts (single ~80k-char lines), and a guard that hangs is a guard that
 * gets disabled. Nothing here shells out.
 *
 * Matching is word-boundary + case-insensitive. That is deliberate: "SAP" must
 * not fire on "sapling"/"disappear", but must fire on "sap", "Sap", "SAP".
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { allClientProcesses } from "@/lib/discovery/client-library";
import { VendorTermGuardSchema } from "@/lib/discovery/schema";

const DATA_DIR = join(process.cwd(), "src/data/discovery");

const guard = VendorTermGuardSchema.parse(
  JSON.parse(readFileSync(join(DATA_DIR, "vendor-term-guard.json"), "utf8")),
);

/** Client-facing source roots. Absent until the PR that introduces them. */
const CLIENT_SOURCE_ROOTS = [
  "src/app/(external)/d",
  "src/components/discovery",
];

/** Consultant-only subtree — vendor terms are legitimate here, so it is excluded. */
const CONSULTANT_SUBTREE = join("src", "components", "discovery", "workbench");

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // Root does not exist yet — covered by the self-check below.
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p.includes(CONSULTANT_SUBTREE)) continue;
      walk(p, out);
    } else if (/\.(tsx|ts|css|json|md)$/.test(name)) {
      out.push(p);
    }
  }
}

/** Every vendor term occurring in `text`, with a count. Whole-file, no line split. */
function vendorHits(text: string): Record<string, number> {
  const hits: Record<string, number> = {};
  for (const term of guard.terms) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const n = text.match(re)?.length ?? 0;
    if (n > 0) hits[term] = n;
  }
  return hits;
}

describe("vendor-term guard — the guard itself", () => {
  it("loads a non-empty term list", () => {
    expect(guard.terms.length).toBeGreaterThan(0);
  });

  it("actually detects a vendor term (the guard is not vacuous)", () => {
    expect(vendorHits("we run SAP S/4HANA here")).toEqual({ SAP: 1, "S/4HANA": 1 });
  });

  it("does not fire on innocent substrings", () => {
    expect(vendorHits("a sapling disappeared into the forest")).toEqual({});
  });
});

/**
 * D6 — the sentinel-flow class. The pipeline once encoded "this process has no
 * flow" as a single step titled "(no MY mandatory steps)", from the SAP source's
 * "Mandatory MY flow" column. 181 processes carried one. Nothing caught it: the
 * guard list had no matching term, every MANIFEST count was internally
 * consistent, and a length check called it a real flow. It would have shipped a
 * fake one-step diagram to 181 client pages and put SAP localisation jargon on a
 * client surface.
 *
 * The pipeline fixed it and the guard list gained the term. These assertions are
 * the belt-and-braces: the data is upstream of us, and a regression there must
 * fail here rather than reach a client.
 */
const PLACEHOLDER_STEP_RE = /\((?:no|not)\b[^)]*\bsteps?\)/i;

describe("D6 — no process may carry a placeholder flow", () => {
  const processes = allClientProcesses();

  it("the detector actually matches the sentinel that shipped", () => {
    // If this stops matching, the assertions below are vacuous.
    expect(PLACEHOLDER_STEP_RE.test("(no MY mandatory steps)")).toBe(true);
    expect(PLACEHOLDER_STEP_RE.test("(no mandatory step)")).toBe(true);
  });

  it("does not fire on legitimate step names", () => {
    // The dataset legitimately contains "(no asynchronous queue)",
    // "(not physical goods)" etc. — parentheticals, but not step placeholders.
    expect(PLACEHOLDER_STEP_RE.test("Post Goods Issue (not physical goods)")).toBe(false);
    expect(PLACEHOLDER_STEP_RE.test("Release Order (no asynchronous queue)")).toBe(false);
  });

  it("no flow step is a placeholder", () => {
    const offenders = processes
      .flatMap((p) => (p.flow ?? []).map((s) => ({ id: p.id, step: s.step })))
      .filter((s) => PLACEHOLDER_STEP_RE.test(s.step));
    expect(
      offenders,
      `Placeholder flow steps found — these must be absent flows, not fake ones:\n${JSON.stringify(offenders.slice(0, 10), null, 2)}`,
    ).toEqual([]);
  });

  it("no flow step contains a vendor term", () => {
    const offenders = processes
      .flatMap((p) => (p.flow ?? []).map((s) => ({ id: p.id, step: s.step })))
      .filter((s) => Object.keys(vendorHits(s.step)).length > 0);
    expect(offenders).toEqual([]);
  });

  it("no sub-step contains a vendor term or a placeholder", () => {
    const offenders = processes
      .flatMap((p) => (p.flow ?? []).flatMap((s) => s.substeps ?? []))
      .filter((b) => PLACEHOLDER_STEP_RE.test(b.t) || Object.keys(vendorHits(b.t)).length > 0);
    expect(offenders).toEqual([]);
  });

  it("a process with a flow has at least one real step (no empty diagrams)", () => {
    const offenders = processes.filter((p) => p.flow !== undefined && p.flow.length === 0);
    expect(offenders).toEqual([]);
  });
});

describe("vendor-term guard — client dataset (INVARIANT 1)", () => {
  it("discovery-library.client.json contains zero vendor terms", () => {
    const text = readFileSync(join(DATA_DIR, "discovery-library.client.json"), "utf8");
    expect(vendorHits(text)).toEqual({});
  });

  it("the guard list carries the sentinel term (D6 regression)", () => {
    expect(guard.terms).toContain("no MY mandatory steps");
  });

  it("the consultant dataset DOES contain vendor terms (proves the scan works on real data)", () => {
    // If this ever comes back clean, the scan is broken — not the data.
    const text = readFileSync(join(DATA_DIR, "discovery-library.consultant.json"), "utf8");
    expect(Object.keys(vendorHits(text)).length).toBeGreaterThan(0);
  });
});

describe("vendor-term guard — client-facing source", () => {
  const files: string[] = [];
  for (const root of CLIENT_SOURCE_ROOTS) walk(join(process.cwd(), root), files);

  it("scans every client-facing source file that exists", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const hits = vendorHits(readFileSync(file, "utf8"));
      if (Object.keys(hits).length > 0) {
        offenders.push(`${file.replace(process.cwd() + "/", "")} → ${JSON.stringify(hits)}`);
      }
    }
    expect(
      offenders,
      `Vendor terms found on the client surface (invariant 1):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  // The Affirm no-stray-hex guard pairs its scan with a non-empty assertion so it
  // cannot pass vacuously. The same risk applies here, but these roots do not
  // exist until PR-2 ships the client routes. This test records that honestly
  // rather than asserting a count that is legitimately zero today.
  it.todo("PR-2: assert CLIENT_SOURCE_ROOTS scan a non-empty file set");
});
