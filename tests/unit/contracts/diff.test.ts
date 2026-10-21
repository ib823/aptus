// @vitest-environment node
/**
 * The semantic-version rules, one case each (diff.ts): removed, renamed and
 * required-added are major; an added optional is minor; annotations and
 * labels alone are patch. And the content hash: what SAP reorders is not a
 * new contract; what it changes always is.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { contractHash } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { diffContracts, nextSemver, semverParts } from "@/lib/contracts/diff";
import type { InterfaceContract, IrProperty } from "@/lib/contracts/ir";
import { contractFromSample } from "@/lib/contracts/sampled";
import { sliceForEntitySet } from "@/lib/contracts/slice";

function base(): InterfaceContract {
  const r = compileContract(readFileSync(path.resolve(__dirname, "../../fixtures/contracts/edmx/sales-order-rap.v4.xml"), "utf8"));
  if (!r.ok) throw new Error(r.detail);
  const s = sliceForEntitySet(r.ir, "SalesOrder");
  if (!s.ok) throw new Error(s.detail);
  return s.contract;
}

/** A deep copy with one change applied. */
function changed(edit: (c: InterfaceContract) => void): InterfaceContract {
  const c = structuredClone(base());
  edit(c);
  return c;
}

function prop(c: InterfaceContract, name: string): IrProperty {
  const p = c.entityType.properties.find((x) => x.name === name);
  if (!p) throw new Error(name);
  return p;
}

const bumpOf = (edit: (c: InterfaceContract) => void) => diffContracts(base(), changed(edit)).bump;

describe("no change", () => {
  it("is no bump, and the same hash", () => {
    expect(diffContracts(base(), base())).toEqual({ bump: null, changes: [] });
    expect(contractHash(base())).toBe(contractHash(base()));
  });

  it("a reordered description hashes the same", () => {
    const reordered = changed((c) => {
      c.entityType.properties.reverse();
      c.entityType.navigations.reverse();
      c.operations.reverse();
    });
    expect(contractHash(reordered)).toBe(contractHash(base()));
  });

  it("property-path lists, referential constraints and overloads in another order hash the same", () => {
    const op = (bindingType: string) => ({
      name: "Release",
      kind: "action" as const,
      bound: true as const,
      bindingType,
      parameters: [{ name: "_it", type: bindingType, nullable: false }],
    });
    const stated = (order: "asc" | "desc") =>
      changed((c) => {
        const caps = c.entitySet.capabilities;
        const paths = order === "asc" ? ["ContactEmail", "Tags"] : ["Tags", "ContactEmail"];
        caps.nonFilterableProperties = [...paths];
        caps.requiredFilterProperties = [...paths];
        caps.nonSortableProperties = [...paths];
        const nav = c.entityType.navigations.find((n) => n.name === "_SoldToParty")!;
        const rcs = [
          { property: "SoldToParty", referencedProperty: "Customer" },
          { property: "SalesOrder", referencedProperty: "LastOrder" },
        ];
        nav.referentialConstraints = order === "asc" ? rcs : [...rcs].reverse();
        const overloads = [op("com.example.salesorder.SalesOrderType"), op("com.example.salesorder.CustomerType")];
        c.operations.push(...(order === "asc" ? overloads : [...overloads].reverse()));
      });
    expect(contractHash(stated("desc"))).toBe(contractHash(stated("asc")));
    // Each list alone, so none of them hides behind another.
    const one = (edit: (c: InterfaceContract) => void) => {
      const c = stated("asc");
      edit(c);
      return contractHash(c);
    };
    const hash = contractHash(stated("asc"));
    expect(one((c) => c.entitySet.capabilities.nonFilterableProperties!.reverse())).toBe(hash);
    expect(one((c) => c.entitySet.capabilities.requiredFilterProperties!.reverse())).toBe(hash);
    expect(one((c) => c.entitySet.capabilities.nonSortableProperties!.reverse())).toBe(hash);
    expect(one((c) => c.entityType.navigations.find((n) => n.name === "_SoldToParty")!.referentialConstraints!.reverse())).toBe(hash);
    expect(one((c) => c.operations.reverse())).toBe(hash);
    // What the lists SAY still counts.
    expect(one((c) => c.entitySet.capabilities.nonFilterableProperties!.pop())).not.toBe(hash);
  });

  it("parameter order is kept: it is how a call is written", () => {
    const withParams = (names: string[]) =>
      changed((c) =>
        c.operations.push({
          name: "Copy",
          kind: "action",
          parameters: names.map((name) => ({ name, type: "Edm.String", nullable: true })),
        }),
      );
    expect(contractHash(withParams(["A", "B"]))).not.toBe(contractHash(withParams(["B", "A"])));
  });

  it("a contract read back with its keys in another order (JSONB) is not a change", () => {
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]))
          : v;
    const roundTripped = reverseKeys(base()) as InterfaceContract;
    expect(diffContracts(roundTripped, base())).toEqual({ bump: null, changes: [] });
    expect(contractHash(roundTripped)).toBe(contractHash(base()));
  });

  it("a changed one never does", () => {
    expect(contractHash(changed((c) => (prop(c, "SoldToParty").label = "Customer")))).not.toBe(contractHash(base()));
  });
});

describe("major", () => {
  it.each<[string, (c: InterfaceContract) => void]>([
    ["a property removed", (c) => (c.entityType.properties = c.entityType.properties.filter((p) => p.name !== "ContactEmail"))],
    ["a property renamed", (c) => (prop(c, "ContactEmail").name = "ContactMail")],
    ["a type changed", (c) => (prop(c, "ItemCount").type = "Edm.Int32")],
    ["a property became a collection", (c) => (prop(c, "ContactEmail").collection = true)],
    ["a property may now be null", (c) => (prop(c, "TotalNetAmount").nullable = true)],
    ["a property may no longer be null", (c) => (prop(c, "ContactEmail").nullable = false)],
    ["a length shrank", (c) => (prop(c, "PurchaseOrderByCustomer").maxLength = 20)],
    ["a scale shrank", (c) => (prop(c, "TotalNetAmount").scale = 2)],
    ["a property is now mandatory on create", (c) => (prop(c, "ContactEmail").capabilities = { mandatory: true })],
    [
      "a mandatory property added",
      (c) => c.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: false, capabilities: { mandatory: true } }),
    ],
    ["a property is now computed", (c) => (prop(c, "ContactEmail").capabilities = { computed: true })],
    ["a property no longer filterable", (c) => (prop(c, "SoldToParty").capabilities = { ...prop(c, "SoldToParty").capabilities, filterable: false })],
    ["the dataset no longer creatable", (c) => (c.entitySet.capabilities.creatable = false)],
    ["reading now requires a filter", (c) => (c.entitySet.capabilities.requiresFilter = true)],
    ["the key changed", (c) => (c.entityType.key = ["SalesOrder", "SalesOrderType"])],
    ["the dataset changed", (c) => (c.entitySet.name = "SalesOrderHeader")],
    ["a navigation removed", (c) => (c.entityType.navigations = c.entityType.navigations.slice(1))],
    ["an enum member removed", (c) => (c.enumTypes[0]!.members = c.enumTypes[0]!.members.slice(1))],
    ["a complex type's property removed", (c) => (c.complexTypes[0]!.properties = c.complexTypes[0]!.properties.slice(1))],
    ["an operation removed", (c) => (c.operations = c.operations.filter((o) => o.name !== "Release"))],
    [
      "a required parameter added",
      (c) => c.operations.find((o) => o.name === "Release")!.parameters.push({ name: "Reason", type: "Edm.String", nullable: false }),
    ],
  ])("%s", (_label, edit) => {
    expect(bumpOf(edit)).toBe("major");
  });
});

describe("minor", () => {
  it.each<[string, (c: InterfaceContract) => void]>([
    ["an optional property added", (c) => c.entityType.properties.push({ name: "Region", type: "Edm.String", nullable: true })],
    ["a length grew", (c) => (prop(c, "PurchaseOrderByCustomer").maxLength = 70)],
    ["the dataset is now deletable", (c) => (c.entitySet.capabilities.deletable = true)],
    ["a navigation added", (c) => c.entityType.navigations.push({ name: "_Notes", target: "ns.Note", collection: true })],
    ["an enum member added", (c) => c.enumTypes[0]!.members.push({ name: "Cancelled", value: "3" })],
    ["an operation added", (c) => c.operations.push({ name: "Archive", kind: "action", bound: true, bindingType: c.entityType.qualifiedName, parameters: [] })],
    [
      "an optional parameter added",
      (c) => c.operations.find((o) => o.name === "Release")!.parameters.push({ name: "Note", type: "Edm.String", nullable: true }),
    ],
    ["a property no longer mandatory", (c) => (prop(c, "SoldToParty").capabilities = {})],
  ])("%s", (_label, edit) => {
    expect(bumpOf(edit)).toBe("minor");
  });
});

describe("patch", () => {
  it.each<[string, (c: InterfaceContract) => void]>([
    ["a label", (c) => (prop(c, "SoldToParty").label = "Customer")],
    ["a quick info", (c) => (prop(c, "SoldToParty").quickInfo = "Who orders")],
    ["a personal-data annotation", (c) => (prop(c, "SoldToParty").personalData = { isPotentiallyPersonal: true })],
    ["the entity set's label", (c) => (c.entitySet.label = "Orders")],
    ["the entity type's personal data", (c) => (c.entityType.personalData = { entitySemantics: "Other" })],
    ["a navigation's partner", (c) => (c.entityType.navigations[0]!.partner = "_Header")],
    ["the entity type's name", (c) => (c.entityType.qualifiedName = "com.example.salesorder.SalesOrderV2Type")],
  ])("%s", (_label, edit) => {
    expect(bumpOf(edit)).toBe("patch");
  });
});

describe("a change of source", () => {
  const sampled = contractFromSample(
    { properties: Object.fromEntries(base().entityType.properties.map((p) => [p.name, { type: "string" }])) },
    "SalesOrder",
    "V4",
  );

  it("sampled → compiled with every sampled field still there is minor", () => {
    expect(diffContracts(sampled, base()).bump).toBe("minor");
  });

  it("a sampled field the description does not declare is major", () => {
    const more = contractFromSample({ properties: { ...sampled.entityType.properties.reduce((o, p) => ({ ...o, [p.name]: {} }), {}), Extra: {} } }, "SalesOrder", "V4");
    expect(diffContracts(more, base()).bump).toBe("major");
  });
});

describe("semver arithmetic", () => {
  it("starts at 1.0.0 and bumps by the rules", () => {
    expect(nextSemver(null, "major")).toBe("1.0.0");
    expect(nextSemver("1.4.2", "major")).toBe("2.0.0");
    expect(nextSemver("1.4.2", "minor")).toBe("1.5.0");
    expect(nextSemver("1.4.2", "patch")).toBe("1.4.3");
    expect(semverParts("12.0.3")).toEqual([12, 0, 3]);
  });
});
