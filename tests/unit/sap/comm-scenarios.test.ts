// @vitest-environment node
/**
 * P1.2 acceptance A3: at least 80% of curated interfaces show their scenario
 * where SAP's table knows it.
 *
 * WHICH POPULATION (the product owner's Q2, answered by default): the S/4HANA
 * Cloud Public Edition OData V2 rows of the committed catalogue
 * (sap-references/api-hub-catalog.json, the source SapHubContent is built
 * from), each joined by the EXACT address rule the screens use
 * (catalogueAddress, then technicalIdsForAddress), and CoreEdge's own curated
 * S/4 services. Both are asserted at 80% or more. OData V4 name guesses are
 * not shown in v1, so the V4 figure is measured and reported, never gating.
 *
 * Over the committed table (sap-references/comm-scenarios/comm-scenarios.tsv,
 * the rows scripts/load-2608-harvest.ts loads), with joinScenarioRows: the
 * same join scenariosForServices runs in one statement, which
 * tests/integration/comm-scenarios.test.ts checks against PostgreSQL.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  askBasisApplies,
  askBasisText,
  joinScenarioRows,
  namedScenarioIds,
  scenariosOf,
  technicalIdsForAddress,
} from "@/lib/sap-public/comm-scenarios";
import { mapEditionFromProductTags } from "@/lib/sap-public/edition-tags";
import { catalogueAddress, isWrapperApiId } from "@/lib/sap-public/hub-content";
import { normalizeHubApiType } from "@/lib/sap-public/hub-import";
import { getSapProduct, getSapServices } from "@/lib/sap-public/tdd-connector";

const ROOT = path.resolve(__dirname, "../../..");

interface Row {
  id: string;
  name: string | null;
  direction: string | null;
  apiIds: string[];
}

function tableRows(): Row[] {
  const lines = readFileSync(path.join(ROOT, "sap-references/comm-scenarios/comm-scenarios.tsv"), "utf8").split("\n");
  const data = lines.filter((l) => !l.startsWith("#") && l.trim() !== "");
  const headers = data.shift()!.split("\t");
  const col = (name: string) => headers.indexOf(name);
  return data.map((line) => {
    const cells = line.split("\t");
    return {
      id: cells[col("comm_scenario_id")]!.trim(),
      name: cells[col("comm_scenario_name")]?.trim() || null,
      direction: cells[col("direction")]?.trim() || null,
      apiIds: [...new Set((cells[col("api_ids")] ?? "").split("|").map((a) => a.trim()).filter(Boolean))],
    };
  });
}

const ROWS = tableRows();

describe("the address rule", () => {
  it.each([
    ["/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV", "ODATAV2", ["API_SUPPLIERINVOICE_PROCESS_SRV_0001"]],
    ["/sap/opu/odata/sap/API_X_SRV;v=0002", "ODATAV2", ["API_X_SRV_0002"]],
    ["/sap/opu/odata/sap/api_x_srv;v=2", null, ["API_X_SRV_0002"]],
    ["/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV", "ODATAV2", ["/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV_0001"]],
    [
      "/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001",
      "ODATAV4",
      ["API_PURCHASEORDER_2_G4BA", "API_PURCHASEORDER_2_0001_G4BA"],
    ],
    ["/sap/opu/odata4/sap/zui_travel_o4/srvd/sap/zui_travel_o4/0001/", null, ["ZUI_TRAVEL_O4_G4BA", "ZUI_TRAVEL_O4_0001_G4BA"]],
    ["/odata/v2", "ODATAV2", []],
    ["/sap/bc/adt/discovery", null, []],
  ] as const)("%s is %j", (p, protocol, ids) => {
    expect(technicalIdsForAddress({ path: p, protocol })).toEqual(ids);
  });

  it("matches exactly, never by a part of an id", () => {
    const join = joinScenarioRows(ROWS, ["API_SUPPLIERINVOICE_PROCESS_SRV"], "2608");
    expect(join.byId.size).toBe(0);
    expect(join.release).toBeNull();
  });

  it("reads the scenarios a curated service's field names", () => {
    expect(namedScenarioIds("SAP_COM_0053 / 0054 / 0057")).toEqual(["SAP_COM_0053", "SAP_COM_0054", "SAP_COM_0057"]);
    expect(namedScenarioIds("SAP_COM_0101")).toEqual(["SAP_COM_0101"]);
  });
});

describe("A3: curated interfaces show their scenario where the table knows it", () => {
  const product = getSapProduct("s4hana")!;

  it("every curated S/4 service the table knows shows the scenario its definition names (gating: 80%)", () => {
    const curated = getSapServices(product);
    const ids = curated.flatMap((s) => technicalIdsForAddress({ path: s.path, protocol: s.protocol ?? "ODATAV2" }));
    const join = joinScenarioRows(ROWS, ids, "2608");
    const known = curated.filter((s) => scenariosOf(join, technicalIdsForAddress({ path: s.path, protocol: s.protocol ?? "ODATAV2" })).length > 0);
    const showing = known.filter((s) => {
      const shown = new Set(scenariosOf(join, technicalIdsForAddress({ path: s.path, protocol: s.protocol ?? "ODATAV2" })).map((r) => r.id));
      return namedScenarioIds(s.scenario).every((id) => shown.has(id));
    });
    expect(known.length).toBeGreaterThan(0);
    expect(showing.length / known.length, showing.map((s) => s.key).join(", ")).toBeGreaterThanOrEqual(0.8);
    // Today, every one: the V4 purchase order through its known service group.
    expect(showing.map((s) => s.key).sort()).toEqual(curated.map((s) => s.key).sort());
  });

  it("the S/4 Public OData V2 catalogue rows show a scenario by the exact address rule (gating: 80%)", () => {
    const catalogue = JSON.parse(readFileSync(path.join(ROOT, "sap-references/api-hub-catalog.json"), "utf8")) as {
      apis: { apiId: string; apiType: string | null; product: string | null }[];
    };
    const publicRows = catalogue.apis.filter(
      (r) => mapEditionFromProductTags([r.product ?? ""]).appliesToPublic && !isWrapperApiId(r.apiId),
    );
    const idsOf = (r: (typeof publicRows)[number], apiType: string) => {
      const address = catalogueAddress({ contentType: "API", apiType, externalId: r.apiId }, "s4");
      // A derived V4 address is a guess: never joined (Q2, Q5 of the design).
      return address && address.basis !== "derived" ? technicalIdsForAddress(address) : [];
    };
    const v2 = publicRows.filter((r) => normalizeHubApiType(r.apiType ?? "") === "ODATAV2");
    const v2Join = joinScenarioRows(ROWS, v2.flatMap((r) => idsOf(r, "ODATAV2")), "2608");
    const v2Shown = v2.filter((r) => scenariosOf(v2Join, idsOf(r, "ODATAV2")).length > 0);
    expect(v2.length).toBeGreaterThan(200);
    expect(v2Shown.length / v2.length).toBeGreaterThanOrEqual(0.8);

    // Reported, not gating: V4 is joined only through a known binding.
    const v4 = publicRows.filter((r) => normalizeHubApiType(r.apiType ?? "") === "ODATAV4");
    const v4Join = joinScenarioRows(ROWS, v4.flatMap((r) => idsOf(r, "ODATAV4")), "2608");
    const v4Shown = v4.filter((r) => scenariosOf(v4Join, idsOf(r, "ODATAV4")).length > 0);
    console.info(
      `[A3] S/4 Public OData V2 catalogue rows showing a scenario: ${v2Shown.length}/${v2.length} ` +
        `(${((100 * v2Shown.length) / v2.length).toFixed(1)}%); OData V4 (known bindings only): ${v4Shown.length}/${v4.length}`,
    );
    expect(v4Shown.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Ask Basis", () => {
  const join = joinScenarioRows(ROWS, ["API_SUPPLIERINVOICE_PROCESS_SRV_0001", "API_CV_ATTACHMENT_SRV_0001"], "2608");

  it("names every scenario that lists the service, with what each also enables", () => {
    const supplier = scenariosOf(join, ["API_SUPPLIERINVOICE_PROCESS_SRV_0001"]);
    expect(supplier.map((s) => s.id)).toEqual(["SAP_COM_0057"]);
    expect(supplier[0]!.interfaceCount).toBeGreaterThan(1);
    expect(scenariosOf(join, ["API_CV_ATTACHMENT_SRV_0001"]).length).toBeGreaterThan(10);
  });

  it("is a call to action only where the service is not shown as activated", () => {
    expect(askBasisApplies("NEEDS_SETUP")).toBe(true);
    expect(askBasisApplies("NOT_CHECKED")).toBe(true);
    expect(askBasisApplies("ACTIVATED")).toBe(false);
  });

  it("writes a request with the scenario, the service and the connection, and nothing secret", () => {
    const text = askBasisText({
      scenario: { id: "SAP_COM_0057", name: null, interfaceCount: 12 },
      service: { technicalId: "API_SUPPLIERINVOICE_PROCESS_SRV_0001", label: "Supplier Invoices" },
      connectionLabel: "Lab X5M",
      release: "2608",
    });
    expect(text).toContain("SAP_COM_0057");
    expect(text).toContain("API_SUPPLIERINVOICE_PROCESS_SRV_0001");
    expect(text).toContain('"Lab X5M"');
    expect(text).toContain("11 other interfaces");
    expect(text).not.toMatch(/https?:|password|secret|token/i);
  });
});
