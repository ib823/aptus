import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { debugHintForStatus, resolveHubItemDependencies } from "@/lib/sap-public/hub-dependencies";

const mocks = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
};
const prisma = {
  scopeCatalogVersion: { findFirst: mocks.findFirst },
  scopeItem: { findMany: mocks.findMany },
} as unknown as PrismaClient;

const SI = (scopeCode: string) => ({ scopeCode, nameClean: `Name ${scopeCode}`, functionalArea: "Finance", prerequisitesHtml: "<p>do X</p>" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({ id: "cv-public" });
  mocks.findMany.mockResolvedValue([]);
});

describe("debugHintForStatus (honest — likely causes, not verdicts)", () => {
  it("reference content → not a tenant endpoint", () => {
    expect(debugHintForStatus(null, "BADI")).toMatch(/reference content/i);
  });
  it("EVENT → subscribe, no read endpoint", () => {
    expect(debugHintForStatus(null, "EVENT")).toMatch(/subscri/i);
  });
  it("200 → activated", () => {
    expect(debugHintForStatus(200, "API")).toMatch(/activated/i);
  });
  it("401 → LIKELY auth (not a verdict)", () => {
    const h = debugHintForStatus(401, "API");
    expect(h).toMatch(/likely/i);
    expect(h).toMatch(/auth/i);
  });
  it("403 → LIKELY scenario/role not authorized", () => {
    expect(debugHintForStatus(403, "API")).toMatch(/likely/i);
  });
  it("404 → names BOTH causes (arrangement not activated AND wrong path)", () => {
    const h = debugHintForStatus(404, "API");
    expect(h.toLowerCase()).toContain("not activated");
    expect(h.toLowerCase()).toContain("path");
    expect(h.toLowerCase()).toContain("both");
  });
  it("0/null → not probed / no response", () => {
    expect(debugHintForStatus(0, "API")).toMatch(/no response|not probed/i);
  });
});

describe("resolveHubItemDependencies (graceful)", () => {
  const item = (scopeItemCodes: string[]) => ({ contentType: "API" as const, scopeItemCodes, communicationScenarios: ["SAP_COM_0053"] });

  it("no codes → empty prerequisites, no note (not an error)", async () => {
    const r = await resolveHubItemDependencies(prisma, item([]), 404);
    expect(r.prerequisiteScopeItems).toEqual([]);
    expect(r.prerequisiteNote).toBeNull();
    expect(r.communicationScenarios).toEqual(["SAP_COM_0053"]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("codes with a match → resolves the ScopeItem within the active version", async () => {
    mocks.findMany.mockResolvedValue([SI("J60")]);
    const r = await resolveHubItemDependencies(prisma, item(["J60"]), 403);
    expect(r.prerequisiteScopeItems).toEqual([SI("J60")]);
    expect(r.prerequisiteNote).toBeNull();
    // matched within the resolved catalog version
    expect(mocks.findMany.mock.calls[0]![0].where.catalogVersionId).toBe("cv-public");
  });

  it("codes but NO match → 'prerequisite unknown', never an error", async () => {
    mocks.findMany.mockResolvedValue([]);
    const r = await resolveHubItemDependencies(prisma, item(["ZZZ"]), 404);
    expect(r.prerequisiteScopeItems).toEqual([]);
    expect(r.prerequisiteNote).toBe("prerequisite unknown");
  });

  it("dedupes a code that maps to many rows (across versions when unversioned)", async () => {
    mocks.findFirst.mockResolvedValue(null); // no active version → cross-version match
    mocks.findMany.mockResolvedValue([SI("J60"), SI("J60")]);
    const r = await resolveHubItemDependencies(prisma, item(["J60"]));
    expect(r.prerequisiteScopeItems).toHaveLength(1);
    // no version filter applied when none is active
    expect(mocks.findMany.mock.calls[0]![0].where.catalogVersionId).toBeUndefined();
  });
});
