import { describe, expect, it } from "vitest";
import {
  resolveTour,
  resolveScreenGuide,
  screenGuideById,
  glossaryFor,
  glossaryEntry,
} from "@/lib/learn/content";
import { SAP_GLOSSARY, SAP_GLOSSARY_ORDER, glossaryIdForStatus, glossaryIdForContentType } from "@/constants/sap-glossary";
import { HUB_CONTENT_TYPES } from "@/lib/sap-public/hub-content";

const HUB_STATUSES = ["ACTIVATED", "NEEDS_SETUP", "NOT_FOUND", "NOT_CHECKED", "AVAILABLE", "REFERENCE"] as const;

describe("learn registry dispatches by path", () => {
  it("resolves the SAP tour on /sap-explorer, the affirm tour on /affirm", () => {
    expect(resolveTour("/sap-explorer")?.id).toBe("sap-explorer");
    expect(resolveTour("/affirm")?.id).toBe("affirm-index");
    expect(resolveTour("/workbench")).toBeNull();
  });

  it("resolves the SAP page guide on /sap-explorer, affirm's on /affirm", () => {
    expect(resolveScreenGuide("/sap-explorer")?.id).toBe("sap-operations");
    expect(resolveScreenGuide("/affirm")?.id).toBe("affirm-index");
  });

  it("screenGuideById finds SAP section guides and affirm guides", () => {
    for (const id of ["sap-catalogue", "sap-procurement", "sap-entity-explorer", "sap-write-mode"]) {
      expect(screenGuideById(id)?.id).toBe(id);
    }
    expect(screenGuideById("affirm-client")?.id).toBe("affirm-client");
    expect(screenGuideById("nope")).toBeNull();
  });

  it("glossaryFor returns the SAP set on /sap-explorer, affirm's elsewhere", () => {
    expect(glossaryFor("/sap-explorer").order).toBe(SAP_GLOSSARY_ORDER);
    expect(glossaryFor("/affirm").order.length).toBeGreaterThan(0);
    expect(glossaryFor("/affirm").order).not.toBe(SAP_GLOSSARY_ORDER);
  });

  it("glossaryEntry looks up across both domains", () => {
    expect(glossaryEntry("odata")?.term).toBe("OData"); // sap
    expect(glossaryEntry("scope-item")?.term).toBeTruthy(); // present in both
    expect(glossaryEntry("does-not-exist")).toBeUndefined();
  });
});

describe("SAP glossary covers every badge and content type (tap-to-define)", () => {
  it("has a plain-language entry for every status badge", () => {
    for (const status of HUB_STATUSES) {
      const id = glossaryIdForStatus(status);
      expect(SAP_GLOSSARY[id], `missing glossary entry for status ${status} (${id})`).toBeDefined();
      expect(SAP_GLOSSARY[id]!.short.length).toBeGreaterThan(0);
    }
  });

  it("has a plain-language entry for every content type", () => {
    for (const type of HUB_CONTENT_TYPES) {
      const id = glossaryIdForContentType(type);
      expect(SAP_GLOSSARY[id], `missing glossary entry for content type ${type} (${id})`).toBeDefined();
      expect(SAP_GLOSSARY[id]!.short.length).toBeGreaterThan(0);
    }
  });

  it("every ordered key resolves to a real entry (no dangling ids)", () => {
    for (const k of SAP_GLOSSARY_ORDER) {
      expect(SAP_GLOSSARY[k], `SAP_GLOSSARY_ORDER references missing key ${k}`).toBeDefined();
    }
  });

  it("required concept terms are all present", () => {
    for (const id of [
      "odata", "odata-v2", "odata-v4", "soap", "metadata", "communication-arrangement",
      "activation", "probe", "entity-set", "crud", "cds-view", "badi", "event",
      "scope-item", "runtime-vs-reference", "authorized-vs-data-confirmed",
    ]) {
      expect(SAP_GLOSSARY[id], `missing concept term ${id}`).toBeDefined();
    }
  });
});
