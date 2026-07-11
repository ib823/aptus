import { describe, expect, it } from "vitest";
import { classifyLoBByKeyword, resolveLineOfBusiness, LOB_OTHER } from "@/lib/sap-public/hub-lob";

describe("classifyLoBByKeyword", () => {
  it.each([
    ["Purchase Order", "Sourcing and Procurement"],
    ["Supplier Invoice", "Sourcing and Procurement"],
    ["Journal Entry - Post", "Finance"],
    ["Sales Order (A2X)", "Sales"],
    ["Bill of Material", "Manufacturing"],
    ["Outbound Delivery", "Supply Chain"],
    ["Business Partner", "Master Data"],
    ["Bank", "Master Data"],
    ["Enterprise Project", "Professional Services"],
    ["Functional Location", "Asset Management"],
  ])("%s → %s", (title, lob) => {
    expect(classifyLoBByKeyword(title)).toBe(lob);
  });

  it("returns null when nothing matches", () => {
    expect(classifyLoBByKeyword("Zzz Widget Frobnicator")).toBeNull();
  });
});

describe("resolveLineOfBusiness", () => {
  it("prefers functionalArea (majority vote) when scope codes resolve", () => {
    expect(resolveLineOfBusiness(["Finance", "Finance", "Sales"], "Purchase Order")).toBe("Finance");
  });

  it("TRIMS whitespace-padded functionalArea (so padded + clean don't split groups)", () => {
    expect(resolveLineOfBusiness(["Finance                              "], "x")).toBe("Finance");
  });

  it("treats GENERIC buckets as low-confidence → keyword fallback (the Billing mis-bucket)", () => {
    // Real data: Billing rows resolve to "Application Platform and Infrastructure".
    expect(resolveLineOfBusiness(["Application Platform and Infrastructure    "], "Billing Document")).toBe("Sales");
    expect(resolveLineOfBusiness(["Uncategorized"], "Purchase Order")).toBe("Sourcing and Procurement");
  });

  it("falls back to the keyword classifier when there are no functional areas", () => {
    expect(resolveLineOfBusiness([], "Purchase Order")).toBe("Sourcing and Procurement");
  });

  it("falls back to Other when neither yields a value", () => {
    expect(resolveLineOfBusiness([], "Zzz Widget")).toBe(LOB_OTHER);
  });

  it("ignores blank functional areas", () => {
    expect(resolveLineOfBusiness(["", "  "], "Sales Order")).toBe("Sales");
  });
});

describe("expanded keyword map", () => {
  it.each([
    ["Billing Document", "Sales"],
    ["Customer Invoice", "Finance"],
    ["G/L Account Master", "Finance"],
    ["Fixed Asset", "Finance"],
    ["Cost Centre", "Finance"],
    ["Purchase Requisition", "Sourcing and Procurement"],
    ["Service Entry Sheet", "Sourcing and Procurement"],
    ["Production Order", "Manufacturing"],
    ["Inbound Delivery", "Supply Chain"],
    ["Maintenance Order", "Asset Management"],
    ["Employee Time Sheet", "Human Resources"],
  ])("%s → %s", (title, lob) => {
    expect(classifyLoBByKeyword(title)).toBe(lob);
  });
});
