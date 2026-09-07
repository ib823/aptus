// @vitest-environment node
/**
 * WS13 — the 2026-09-07 data-acquisition harvest.
 *
 * Read against the COMMITTED harvest files. These are the acceptance tests the
 * brief specified, run here rather than taken on the harvest notes' word.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pipes, readHarvestTsv } from "../../../scripts/load-2608-harvest";
import { DB_FACTS_2608 } from "../../../scripts/recon-2608";

const read = (rel: string) => readHarvestTsv(readFileSync(`sap-references/${rel}`, "utf8"));

describe("readHarvestTsv", () => {
  it("separates the provenance block from the rows", () => {
    const { provenance, headers, rows } = readHarvestTsv("# a\n# b\nx\ty\n1\t2\n");
    expect(provenance).toEqual(["# a", "# b"]);
    expect(headers).toEqual(["x", "y"]);
    expect(rows).toEqual([{ x: "1", y: "2" }]);
  });
});

describe("pipes", () => {
  it("splits, trims and de-duplicates, and leaves empty empty", () => {
    expect(pipes("J60|1WQ| J60 ")).toEqual(["J60", "1WQ"]);
    expect(pipes("")).toEqual([]);
  });
});

describe("target 1 — Fiori Apps Library", () => {
  it("carries every app, each with a provenance block", () => {
    const { provenance, rows } = read("fiori-apps/apps-2608.tsv");
    expect(provenance.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(DB_FACTS_2608.fioriApps);
  });

  it("closes the WS11 blind spot: F1577 and F1578 name their scope items", () => {
    // WS11 measured both apps in 0 of 14,088 process steps and concluded SAP
    // had attached them to no scope item. SAP had — here.
    const { rows } = read("fiori-apps/apps-2608.tsv");
    const byId = new Map(rows.map((r) => [r["app_id"], r]));
    expect(pipes(byId.get("F1577")?.["required_scope_item_ids"] ?? "")).toContain("J60");
    expect(pipes(byId.get("F1578")?.["required_scope_item_ids"] ?? "")).toContain("J60");
    // SAP_FIN_BC_AP_CHECK_* is the catalog id aptus could not resolve at all.
    expect(byId.get("F1577")?.["business_catalog_ids"]).toContain("SAP_FIN_BC_AP_CHECK");
  });
});

describe("target 2 — the scope item to communication scenario bridge", () => {
  it("is entirely PUBLISHED, and every row carries evidence", () => {
    const { rows } = read("comm-scenarios/scope-item-comm-scenarios.tsv");
    expect(rows).toHaveLength(DB_FACTS_2608.scopeCommScenarioLinks);
    expect(rows.every((r) => r["link_source"] === "PUBLISHED")).toBe(true);
    // A row with no evidence is worse than a missing row.
    expect(rows.every((r) => (r["evidence"] ?? "").trim() !== "")).toBe(true);
    expect(rows.every((r) => (r["source_url"] ?? "").startsWith("http"))).toBe(true);
  });

  it("resolves 1RO to its four scenarios", () => {
    const { rows } = read("comm-scenarios/scope-item-comm-scenarios.tsv");
    const scenarios = rows.filter((r) => r["scope_item_id"] === "1RO").map((r) => r["comm_scenario_id"]).sort();
    expect(scenarios).toEqual(["SAP_COM_0008", "SAP_COM_0009", "SAP_COM_0539", "SAP_COM_0540"]);
  });

  it("keeps the rows whose scope id SAP publishes but the catalogue does not carry", () => {
    // 21 ids across 91 rows, 8 of them blank. Dropping them would hide a real
    // disagreement between two SAP publications, so they are kept and flagged.
    const { rows } = read("comm-scenarios/scope-item-comm-scenarios.tsv");
    expect(rows.some((r) => (r["scope_item_id"] ?? "").trim() === "")).toBe(true);
  });

  it("leaves the four tenant-only scenario columns empty on every row", () => {
    // SAP publishes none of these outside a provisioned tenant. Empty because
    // SAP did not publish them, not because a loader failed to fill them.
    const { rows } = read("comm-scenarios/comm-scenarios.tsv");
    for (const col of ["direction", "auth_methods", "inbound_services", "outbound_services"]) {
      expect(rows.every((r) => (r[col] ?? "") === ""), `${col} should be empty on every row`).toBe(true);
    }
  });

  it("names only the scenarios SAP names unambiguously", () => {
    const { rows } = read("comm-scenarios/comm-scenarios.tsv");
    const named = rows.filter((r) => (r["comm_scenario_name"] ?? "").trim() !== "");
    expect(named).toHaveLength(DB_FACTS_2608.commScenariosNamed);
  });
});

describe("target 3 — negative evidence", () => {
  it("quotes SAP verbatim and cites a source on every statement", () => {
    const { rows } = read("restrictions/not-supported.tsv");
    expect(rows).toHaveLength(DB_FACTS_2608.notSupportedStatements);
    expect(rows.every((r) => (r["sap_statement_verbatim"] ?? "").trim() !== "")).toBe(true);
    expect(rows.every((r) => (r["source_url"] ?? "").startsWith("http"))).toBe(true);
  });

  it("carries the Malaysia cross-border e-invoice exclusions", () => {
    // Five statements bearing directly on a Malaysian e-invoicing design.
    const { rows } = read("restrictions/not-supported.tsv");
    const my = rows.filter((r) => r["country"] === "Malaysia");
    expect(my.length).toBeGreaterThan(0);
    expect(my.some((r) => (r["what_is_not_supported"] ?? "").includes("Cross-border electronic invoices"))).toBe(true);
  });

  it("does NOT claim the RE-FX Malaysian e-invoice exclusion", () => {
    // That statement is KBA-only and is not reachable anonymously. The one row
    // matching "RE-FX" is about deleting a contract with earmarked funds.
    const { rows } = read("restrictions/not-supported.tsv");
    const refx = rows.filter((r) => JSON.stringify(r).includes("RE-FX"));
    expect(refx.every((r) => !(r["sap_statement_verbatim"] ?? "").includes("e-invoice"))).toBe(true);
  });
});
