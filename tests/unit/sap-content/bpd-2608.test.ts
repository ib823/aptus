// @vitest-environment node
// (adm-zip's inflate returns empty buffers under jsdom's cross-realm Uint8Array; these tests are pure Node.)
/**
 * 2608 WS5 — the BPD parsers against the COMMITTED drop files, and the
 * regenerated Fit-to-Standard data against the parsers.
 *
 * The drop is checked in (sap-references/2608/bpd-fts, sha256-pinned by the
 * manifest), so these tests read the real SAP files: a synthetic fixture
 * would only prove the parser agrees with itself.
 */
import { describe, expect, it, vi } from "vitest";

// Real workbooks (the S&P questionnaire alone is 5 MB): allow a minute per test.
vi.setConfig({ testTimeout: 60_000 });

import { composeBpd } from "../../../scripts/lib/bpd-2608/compose";
import { cleanStepName, parseBpdDocx } from "../../../scripts/lib/bpd-2608/parse-bpd-docx";
import {
  appFromAccess,
  htmlToText,
  overviewFromHtml,
  parseBpdXlsx,
  roleFromLogOn,
} from "../../../scripts/lib/bpd-2608/parse-bpd-xlsx";
import { BPD_2608_SCOPE_ITEMS, sapContentSourcesFor } from "../../../scripts/lib/sap-content-sources";
import { scopeItems } from "@/lib/fts/data";

const SOURCES = sapContentSourcesFor("2608");
const bpd = (code: string) => SOURCES.bpd.find((b) => b.scopeItemCode === code)!;

describe("BPD xlsx parser — text helpers", () => {
  it("strips HTML to text and finds the Overview paragraph", () => {
    expect(htmlToText("<p>Log on to the <b>SAP Fiori</b>&nbsp;launchpad.</p><p>Next.</p>")).toBe(
      "Log on to the SAP Fiori launchpad.\nNext.",
    );
    expect(
      overviewFromHtml("<h1>Purpose</h1><h2>Overview</h2><p>This scope item does X.</p><h2>Key</h2><p>no</p>"),
    ).toBe("This scope item does X.");
  });

  it("reads the role from a Log On action and the app from an Access the App action — or nothing", () => {
    expect(roleFromLogOn("<p>Log on to the SAP Fiori Launchpad as an Internal Sales Representative.</p>")).toBe(
      "Internal Sales Representative",
    );
    expect(roleFromLogOn("<p>Log on to the Fiori launchpad as a Billing Clerk (SAP_BR_BILLING_CLERK).</p>")).toBe(
      "Billing Clerk",
    );
    expect(roleFromLogOn("<p>Log on to the launchpad.</p>")).toBe("");
    expect(appFromAccess("<p>Open <b>Manage Sales Inquiries (F2370)</b> app.</p>")).toBe(
      "Manage Sales Inquiries (F2370)",
    );
    expect(appFromAccess("<p>Open Post Goods Movement (MIGO).</p>")).toBe("Post Goods Movement (MIGO)");
    expect(appFromAccess("<p>Choose the tile.</p>")).toBe("");
  });

  it("docx step names lose the page reference, never the (Optional) marker", () => {
    expect(cleanStepName("Create Sales Inquiry  [page ] 61")).toBe("Create Sales Inquiry");
    expect(cleanStepName("Set Credit Limit (Optional) 61")).toBe("Set Credit Limit (Optional)");
  });
});

describe("BPD 1IQ — the master prompt's anchor (3 → 3 steps)", () => {
  it("xlsx: 3 process steps after Test Procedures, each with role + app from its own actions", async () => {
    const x = await parseBpdXlsx(bpd("1IQ").xlsx, "1IQ");
    expect(x.title).toBe("Sales Inquiry");
    expect(x.steps.map((s) => s.name)).toEqual([
      "Create Sales Inquiry",
      "Change Sales Inquiry",
      "Reject Sales Inquiry",
    ]);
    expect(x.steps.every((s) => s.role === "Internal Sales Representative")).toBe(true);
    expect(x.fioriApps).toEqual(["Manage Sales Inquiries (F2370)"]);
    expect(x.overview).toMatch(/^This scope item describes the process for a standard sales inquiry/);
    // Preliminary configuration activities are not steps.
    expect(x.activities.filter((a) => a.band === "preliminary").length).toBeGreaterThan(0);
  });

  it("docx: roles with SAP_BR ids, 14 master-data rows, 2 succeeding processes, a 3-row Overview Table", () => {
    const d = parseBpdDocx(bpd("1IQ").docx, "1IQ");
    expect(d.title).toBe("Sales Inquiry");
    expect(d.businessRoles).toEqual([{ name: "Internal Sales Representative", id: "SAP_BR_INTERNAL_SALES_REP" }]);
    expect(d.masterData).toHaveLength(14);
    expect(d.masterData[0]).toMatchObject({ data: "Material", sample: "TG11" });
    expect(d.succeedingProcesses.map((s) => s.raw.slice(0, 3))).toEqual(["BDG", "BD9"]);
    expect(d.overviewSteps.map((s) => s.name)).toEqual([
      "Create Sales Inquiry",
      "Change Sales Inquiry",
      "Reject Sales Inquiry",
    ]);
    expect(d.overviewSteps[0]!.expected).toBe("The sales inquiry is created and printed.");
  });

  it("composed: xlsx steps, docx expected/roles/master data — and the committed data file is exactly that", async () => {
    const x = await parseBpdXlsx(bpd("1IQ").xlsx, "1IQ");
    const d = parseBpdDocx(bpd("1IQ").docx, "1IQ");
    const c = composeBpd(x, d);
    expect(c.process_steps[0]).toEqual({
      name: "Create Sales Inquiry",
      role: "Internal Sales Representative",
      app: "Manage Sales Inquiries (F2370)",
      expected: "The sales inquiry is created and printed.",
    });
    expect(c.provenance).toMatchObject({
      steps: "xlsx",
      roles: "docx",
      overview: "xlsx",
      masterData: "docx",
      succeeding: "docx",
    });
    const emitted = scopeItems["1IQ"]!;
    expect(emitted.process_steps).toEqual(c.process_steps);
    expect(emitted.business_roles).toEqual(c.business_roles);
    expect(emitted.master_data).toEqual(c.master_data);
    expect(emitted.release).toBe("S/4HANA Cloud Public Edition 2608 — MY");
    // Curated decisions carried over, not re-authored.
    expect(emitted.decisions).toHaveLength(7);
    expect(emitted.decisions.find((dd) => dd.id === "d3")?.sscui_id).toBe("102494");
  });
});

describe("all nine 2608 BPDs regenerate the workbench data", () => {
  it("every code parses to steps, and the committed data file matches the parsers (drift guard)", async () => {
    for (const code of BPD_2608_SCOPE_ITEMS) {
      const x = await parseBpdXlsx(bpd(code).xlsx, code);
      const d = parseBpdDocx(bpd(code).docx, code);
      const c = composeBpd(x, d);
      expect(c.process_steps.length, code).toBeGreaterThan(0);
      const emitted = scopeItems[code];
      expect(emitted, `${code} is registered`).toBeDefined();
      expect(emitted!.process_steps, code).toEqual(c.process_steps);
      expect(emitted!.fiori_apps, code).toEqual(c.fiori_apps);
      expect(emitted!.release, code).toMatch(/2608/);
      // A step that names nothing keeps an empty cell — never an inferred role or app.
      for (const s of emitted!.process_steps) {
        expect(typeof s.role, code).toBe("string");
        expect(typeof s.app, code).toBe("string");
      }
    }
  });

  it("the three 2602 items keep their step counts where SAP kept them: 1IQ 3, BDG 10; BD9 grew 32 → 35", () => {
    expect(scopeItems["1IQ"]!.process_steps).toHaveLength(3);
    expect(scopeItems.BDG!.process_steps).toHaveLength(10);
    expect(scopeItems.BD9!.process_steps).toHaveLength(35);
    expect(scopeItems.BD9!.process_steps.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Handling Unit Management (Optional)", "eDocument Cockpit"]),
    );
  });

  it("BDW's variant sections do not truncate its steps, and repeated step names survive", () => {
    const names = scopeItems.BDW!.process_steps.map((s) => s.name);
    expect(names.length).toBe(28);
    expect(names.filter((n) => n === "Display Pallets Stock").length).toBe(4);
  });

  it("the six items new to the workbench carry no invented decisions and no derived SSCUI appendix", () => {
    for (const code of ["1NT", "2ET", "BDW", "J45", "J59", "J60"]) {
      const item = scopeItems[code]!;
      expect(item.decisions, code).toEqual([]);
      expect(item.sscui_refs, code).toEqual([]);
    }
    // The curated 2602 appendix survives the regeneration where it existed.
    expect(scopeItems.BD9!.sscui_refs).toHaveLength(50);
    expect(scopeItems["1IQ"]!.sscui_refs).toEqual([]);
  });
});
