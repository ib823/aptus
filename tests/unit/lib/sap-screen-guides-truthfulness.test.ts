// @vitest-environment node
/**
 * The /sap-explorer guide does not deny that the page can change SAP data.
 *
 * It said "Nothing on this page changes your SAP data" while the same page
 * rendered Write Mode, which creates records in a live SAP tenant (P0.7). A
 * reader who believed the guide had no reason to treat Write Mode with care,
 * and nothing in the tree connected the sentence to the panel.
 *
 * Keyed on the panel being rendered, like manual-truthfulness.test.ts: while
 * the explorer renders the write-back panel, no guide shown on that page may
 * claim the page is read-only, and the page-level guide must name the
 * exception.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SAP_SCREEN_GUIDES, sapScreenGuideForPath } from "@/constants/sap-screen-guides";

const explorer = readFileSync(path.resolve(process.cwd(), "src/components/sap/SapCloudExplorer.tsx"), "utf8");
const rendersWriteMode = /<SapWriteBackPanel\b/.test(explorer);

/** Claims that are false on a page that can write. */
const DENIALS = [
  /\bnothing on this page changes\b/i,
  /\bthis page (only|never) (reads|writes)\b/i,
  /\bthis page is read-only\b/i,
  /\bnever changes your SAP data\b/i,
];

/** The guides shown on /sap-explorer, at page level — not the sections that really are read-only. */
const PAGE_GUIDES = ["sap-operations"] as const;

function text(id: string): string {
  const g = SAP_SCREEN_GUIDES[id];
  if (!g) throw new Error(`no guide ${id}`);
  return [g.title, g.what, g.todo, g.why, g.next].join(" ");
}

describe("the SAP explorer guide tells the truth about writing", () => {
  it("the explorer still renders Write Mode — otherwise this test guards nothing", () => {
    expect(rendersWriteMode).toBe(true);
  });

  it.each(PAGE_GUIDES)("%s does not claim the page cannot change SAP data", (id) => {
    for (const denial of DENIALS) expect(text(id)).not.toMatch(denial);
  });

  it("the page-level guide names Write Mode as the exception, and says writes are recorded", () => {
    const guide = sapScreenGuideForPath("/sap-explorer");
    expect(guide?.id).toBe("sap-operations");
    expect(guide?.next).toMatch(/Write Mode/);
    expect(guide?.next).toMatch(/creates real records in SAP/);
    expect(guide?.next).toMatch(/recorded under your name before SAP is called/);
  });

  it("the Write Mode guide says each write is recorded before it is sent", () => {
    expect(text("sap-write-mode")).toMatch(/recorded under your name before it is sent/);
  });
});
