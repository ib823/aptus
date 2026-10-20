/**
 * resolveInterfaceService — the one answer every runtime path asks for.
 *
 * Precedence, and no fallback: an interface carrying its own service path is
 * called on that path and only that path; anything else is exactly what it was
 * before (`resolveHubService`). The catalogue resolver is mocked so these tests
 * can say precisely when it was — and was not — consulted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const hub = vi.hoisted(() => ({ resolveHubService: vi.fn() }));
vi.mock("@/lib/sap-public/resolve-hub-service", () => hub);

import {
  customServiceDefinition,
  hasCustomService,
  productAcceptsServicePath,
  resolveInterfaceService,
} from "@/lib/sap-public/interface-service";
import { getSapProduct, type SapOdataProduct } from "@/lib/sap-public/tdd-connector";

const product = (key: string): SapOdataProduct => getSapProduct(key)!;
const CATALOGUE = { key: "bp", label: "BP", scenario: "", domain: "", path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" };

beforeEach(() => {
  hub.resolveHubService.mockReset();
  hub.resolveHubService.mockResolvedValue(CATALOGUE);
});

describe("the custom path wins", () => {
  it("resolves the interface's own V2 path without asking the catalogue", async () => {
    const r = await resolveInterfaceService(product("s4hana"), {
      sapProduct: "s4hana",
      externalId: "custom:/sap/opu/odata/sap/ZUI_X_O2",
      servicePath: "/sap/opu/odata/sap/ZUI_X_O2",
      odataVersion: "V2",
    });
    expect(r).toEqual({
      source: "custom",
      service: {
        key: "custom:/sap/opu/odata/sap/ZUI_X_O2",
        label: "custom:/sap/opu/odata/sap/ZUI_X_O2",
        scenario: "",
        domain: "",
        path: "/sap/opu/odata/sap/ZUI_X_O2",
        protocol: "ODATAV2",
      },
    });
    expect(hub.resolveHubService).not.toHaveBeenCalled();
  });

  it("the protocol follows the declared version", async () => {
    const r = await resolveInterfaceService(product("s4hana-onprem"), {
      sapProduct: "s4hana-onprem",
      externalId: "custom:/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001",
      servicePath: "/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001",
      odataVersion: "V4",
    });
    expect(r?.service.protocol).toBe("ODATAV4");
    expect(r?.service.path).toBe("/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001");
  });

  it("ECC — no curated services, no catalogue scope — resolves its own Gateway service", async () => {
    const r = await resolveInterfaceService(product("ecc"), {
      sapProduct: "ecc",
      externalId: "custom:/sap/opu/odata/sap/ZMM_PO_SRV",
      servicePath: "/sap/opu/odata/sap/ZMM_PO_SRV",
      odataVersion: "V2",
    });
    expect(r?.source).toBe("custom");
    expect(r?.service.path).toBe("/sap/opu/odata/sap/ZMM_PO_SRV");
  });

  it("SuccessFactors /odata/v2 resolves", async () => {
    const r = await resolveInterfaceService(product("successfactors"), {
      sapProduct: "successfactors",
      externalId: "custom:/odata/v2",
      servicePath: "/odata/v2",
      odataVersion: "V2",
    });
    expect(r?.service.path).toBe("/odata/v2");
  });

  it("a YY1_* key-user service on private cloud resolves", async () => {
    const r = await resolveInterfaceService(product("cloud-erp-private"), {
      sapProduct: "cloud-erp-private",
      externalId: "custom:/sap/opu/odata/sap/YY1_SALESORDERX_CDS",
      servicePath: "/sap/opu/odata/sap/YY1_SALESORDERX_CDS",
      odataVersion: "V2",
    });
    expect(r?.source).toBe("custom");
  });
});

describe("never a fallback", () => {
  it("Ariba with a path → null, and the catalogue is not asked", async () => {
    const r = await resolveInterfaceService(product("ariba"), {
      sapProduct: "ariba",
      externalId: "custom:/api/x",
      servicePath: "/api/x",
      odataVersion: "V2",
    });
    expect(r).toBeNull();
    expect(hub.resolveHubService).not.toHaveBeenCalled();
  });

  it("a corrupt stored path → null, not the catalogue", async () => {
    for (const bad of ["https://evil.example/x", "/a/../b", "/x/", "/x?sap-client=100"]) {
      const r = await resolveInterfaceService(product("s4hana"), {
        sapProduct: "s4hana",
        externalId: "API_BUSINESS_PARTNER",
        servicePath: bad,
        odataVersion: "V2",
      });
      expect(r, bad).toBeNull();
    }
    expect(hub.resolveHubService).not.toHaveBeenCalled();
  });

  it("a path with no valid version → null", async () => {
    const r = await resolveInterfaceService(product("s4hana"), {
      sapProduct: "s4hana",
      externalId: "custom:/x",
      servicePath: "/x",
      odataVersion: null,
    });
    expect(r).toBeNull();
  });

  it("a custom: id that lost its path → null, never resolved as a catalogue id", async () => {
    const r = await resolveInterfaceService(product("s4hana"), {
      sapProduct: "s4hana",
      externalId: "custom:/sap/opu/odata/sap/ZUI_X_O2",
      servicePath: null,
    });
    expect(r).toBeNull();
    expect(hub.resolveHubService).not.toHaveBeenCalled();
  });

  it("the product asked about must be the interface's own", () => {
    expect(
      customServiceDefinition(
        { key: "s4hana" },
        { sapProduct: "ecc", externalId: "custom:/x", servicePath: "/x", odataVersion: "V2" },
      ),
    ).toBeNull();
  });
});

describe("catalogue interfaces are unchanged", () => {
  it("asks resolveHubService with exactly the arguments it always did", async () => {
    const p = product("s4hana");
    const r = await resolveInterfaceService(p, { sapProduct: "s4hana", externalId: "API_BUSINESS_PARTNER" });
    expect(hub.resolveHubService).toHaveBeenCalledWith(p, "API_BUSINESS_PARTNER");
    expect(r).toEqual({ source: "catalogue", service: CATALOGUE });
  });

  it("reads an absent or empty path as catalogue", async () => {
    await resolveInterfaceService(product("s4hana"), {
      sapProduct: "s4hana",
      externalId: "API_X",
      servicePath: "",
      odataVersion: null,
    });
    expect(hub.resolveHubService).toHaveBeenCalledTimes(1);
    expect(hasCustomService({})).toBe(false);
    expect(hasCustomService({ servicePath: null })).toBe(false);
    expect(hasCustomService({ servicePath: "" })).toBe(false);
    expect(hasCustomService({ servicePath: "/x" })).toBe(true);
  });

  it("a catalogue miss is still null", async () => {
    hub.resolveHubService.mockResolvedValue(null);
    expect(await resolveInterfaceService(product("s4hana"), { sapProduct: "s4hana", externalId: "API_NOPE" })).toBeNull();
  });
});

describe("productAcceptsServicePath", () => {
  it.each([
    ["s4hana", true],
    ["successfactors", true],
    ["cloud-erp-private", true],
    ["s4hana-onprem", true],
    ["ecc", true],
    ["ariba", false],
    ["hana_cloud", false],
    ["", false],
  ])("%s → %s", (key, expected) => {
    expect(productAcceptsServicePath(key)).toBe(expected);
  });
});
