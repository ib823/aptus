// @vitest-environment node
/**
 * The semantic-version rules, one case each (diff.ts): removed, renamed and
 * required-added are major; an added optional is minor; annotations and
 * labels alone are patch. And the content hash: what SAP reorders is not a
 * new contract; what it changes always is.
 */

import { readFileSync } from "fs";
import path from "path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { contractHash } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { diffContracts, nextSemver, semverParts } from "@/lib/contracts/diff";
import type { InterfaceContract, IrProperty } from "@/lib/contracts/ir";
import { standaloneSchemas } from "@/lib/contracts/json-schema";
import { contractFromSample } from "@/lib/contracts/sampled";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { inferResponseSchema } from "@/lib/studio/schema-capture";

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
    // What a read can now return that the previous record schema refuses (round 2).
    ["an enum member added (a closed enum in the record schema)", (c) => c.enumTypes[0]!.members.push({ name: "Cancelled", value: "3" })],
    [
      "a property added to a closed complex type",
      (c) => c.complexTypes[0]!.properties.push({ name: "Region", type: "Edm.String", nullable: true }),
    ],
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
    [
      "a member added to a flags enum (a string in every schema)",
      (c) => {
        c.enumTypes[0]!.isFlags = true;
        c.enumTypes[0]!.members.push({ name: "Cancelled", value: "4" });
      },
    ],
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

describe("two sampled contracts", () => {
  const capture = (rows: Record<string, unknown>[]) => {
    const schema = inferResponseSchema(rows);
    if (!schema) throw new Error("no schema");
    return contractFromSample(schema, "SalesOrder", "V4");
  };

  it("a value seen where the last sample saw only null is not a change of type or nullability", () => {
    const before = capture([{ ID: "1", Note: null }, { ID: "2", Note: null }]);
    const after = capture([{ ID: "1", Note: "x" }, { ID: "2", Note: "y" }]);
    expect(diffContracts(before, after)).toEqual({ bump: null, changes: [] });
    expect(diffContracts(after, before)).toEqual({ bump: null, changes: [] });
  });

  it("a field the sample no longer shows is major; a new one is minor", () => {
    const before = capture([{ ID: "1", Note: "x" }]);
    expect(diffContracts(before, capture([{ ID: "1" }])).bump).toBe("major");
    expect(diffContracts(before, capture([{ ID: "1", Note: "x", Extra: 1 }]))).toEqual({
      bump: "minor",
      changes: [{ bump: "minor", at: "property:Extra", change: "Extra was added." }],
    });
  });
});

describe("an entity type's openness", () => {
  it("closing an open type is major; opening a closed one is minor", () => {
    const open = changed((c) => (c.entityType.openType = true));
    expect(diffContracts(open, base()).bump).toBe("major");
    expect(diffContracts(base(), open).bump).toBe("minor");
  });

  it("a complex type follows the same rule: its schema refuses dynamic properties once closed", () => {
    const withAddress = (open: boolean) =>
      changed((c) => {
        c.complexTypes.push({
          name: "Addr",
          qualifiedName: "ns.Addr",
          properties: [{ name: "City", type: "Edm.String", nullable: true }],
          navigations: [],
          ...(open ? { openType: true as const } : {}),
        });
        c.entityType.properties.push({ name: "Address", type: "ns.Addr", nullable: true });
      });
    expect(diffContracts(withAddress(true), withAddress(false))).toMatchObject({
      bump: "major",
      changes: [{ bump: "major", at: "complexType:Addr" }],
    });
    expect(diffContracts(withAddress(false), withAddress(true))).toMatchObject({
      bump: "minor",
      changes: [{ bump: "minor", at: "complexType:Addr" }],
    });
    expect(diffContracts(withAddress(true), withAddress(true)).bump).toBeNull();
  });
});

describe("overloads of one name", () => {
  const V4 = (body: string) =>
    '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
    `<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">${body}</Schema></edmx:DataServices></edmx:Edmx>`;
  const RELEASE_ONE = '<Action Name="Release" IsBound="true"><Parameter Name="it" Type="ns.T"/><Parameter Name="Reason" Type="Edm.String"/></Action>';
  const RELEASE_MANY =
    '<Action Name="Release" IsBound="true"><Parameter Name="it" Type="Collection(ns.T)"/><Parameter Name="Date" Type="Edm.Date"/></Action>';
  const contract = (extra: string, ops: string): InterfaceContract => {
    const r = compileContract(
      V4(
        `<EntityType Name="T"><Key><PropertyRef Name="K"/></Key><Property Name="K" Type="Edm.String" Nullable="false"/>${extra}</EntityType>` +
          ops +
          '<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer>',
      ),
    );
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "S");
    if (!s.ok) throw new Error(s.detail);
    return s.contract;
  };

  it("are each compared with their own overload, never with the last one of the name", () => {
    const both = RELEASE_ONE + RELEASE_MANY;
    const d = diffContracts(contract("", both), contract('<Property Name="New" Type="Edm.String"/>', both));
    expect(d).toEqual({ bump: "minor", changes: [{ bump: "minor", at: "property:New", change: "New was added." }] });
    expect(diffContracts(contract("", both), contract("", RELEASE_MANY + RELEASE_ONE)).bump).toBeNull();
  });

  it("an overload removed is major and one added is minor, on its own", () => {
    const removed = diffContracts(contract("", RELEASE_ONE + RELEASE_MANY), contract("", RELEASE_MANY));
    expect(removed.bump).toBe("major");
    expect(removed.changes).toHaveLength(1);
    expect(removed.changes[0]).toMatchObject({ bump: "major", at: "operation:Release" });
    const added = diffContracts(contract("", RELEASE_MANY), contract("", RELEASE_ONE + RELEASE_MANY));
    expect(added.bump).toBe("minor");
    expect(added.changes).toHaveLength(1);
  });

  it("one overload's own change is still found", () => {
    const tighter = '<Action Name="Release" IsBound="true"><Parameter Name="it" Type="ns.T"/><Parameter Name="Reason" Type="Edm.String" Nullable="false"/></Action>';
    const d = diffContracts(contract("", RELEASE_ONE + RELEASE_MANY), contract("", tighter + RELEASE_MANY));
    expect(d).toEqual({
      bump: "major",
      changes: [{ bump: "major", at: "operation:Release", change: "Its parameter Reason is now required." }],
    });
  });

  it("a single operation gaining an optional parameter is still minor, not a removal and an addition", () => {
    const more = '<Action Name="Release" IsBound="true"><Parameter Name="it" Type="ns.T"/><Parameter Name="Reason" Type="Edm.String"/><Parameter Name="Note" Type="Edm.String"/></Action>';
    expect(diffContracts(contract("", RELEASE_ONE), contract("", more)).bump).toBe("minor");
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

/*
 * Hostile-input review round 2: the bump and the schemas tell one story. A
 * consumer pinned to ^1.0 validating rows with 1.0.0's record schema (what
 * /schema says it is for) must keep accepting every row of a minor version;
 * where the old schema would refuse the new rows, the bump is major.
 */
describe("a minor bump never makes new rows fail the previous version's record schema", () => {
  const HEAD =
    '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="Z_SRV" xmlns="http://docs.oasis-open.org/odata/ns/edm">';
  const TAIL =
    '<EntityContainer Name="C"><EntitySet Name="Orders" EntityType="Z_SRV.Order"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
  const contract = (types: string, props: string, key = '<Property Name="ID" Type="Edm.String" Nullable="false"/>'): InterfaceContract => {
    const r = compileContract(
      `${HEAD}${types}<EntityType Name="Order"><Key><PropertyRef Name="ID"/></Key>${key}${props}</EntityType>${TAIL}`,
    );
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "Orders");
    if (!s.ok) throw new Error(s.detail);
    return s.contract;
  };
  const validate = (schema: Record<string, unknown>, value: Record<string, unknown>) => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    return ajv.compile(schema)(value) === true;
  };
  const accepts = (c: InterfaceContract, row: Record<string, unknown>) => validate(standaloneSchemas(c, "Orders").record, row);
  const address = (props: string, open = false) =>
    contract(
      `<ComplexType Name="Address"${open ? ' OpenType="true"' : ""}><Property Name="Street" Type="Edm.String"/>${props}</ComplexType>`,
      '<Property Name="ShipTo" Type="Z_SRV.Address"/>',
    );
  const status = (members: string, flags = false) =>
    contract(`<EnumType Name="Status"${flags ? ' IsFlags="true"' : ""}>${members}</EnumType>`, '<Property Name="Status" Type="Z_SRV.Status"/>');

  it.each<[string, InterfaceContract, InterfaceContract, Record<string, unknown>, "major" | "minor"]>([
    [
      "a property added to a closed complex type",
      address(""),
      address('<Property Name="City" Type="Edm.String"/>'),
      { ID: "1", ShipTo: { Street: "Main", City: "Walldorf" } },
      "major",
    ],
    [
      "a property added to an open complex type",
      address("", true),
      address('<Property Name="City" Type="Edm.String"/>', true),
      { ID: "1", ShipTo: { Street: "Main", City: "Walldorf" } },
      "minor",
    ],
    ["an enum member added", status('<Member Name="Open"/>'), status('<Member Name="Open"/><Member Name="Blocked"/>'), { ID: "1", Status: "Blocked" }, "major"],
    [
      "a member added to a flags enum",
      status('<Member Name="Open"/>', true),
      status('<Member Name="Open"/><Member Name="Blocked"/>', true),
      { ID: "1", Status: "Open,Blocked" },
      "minor",
    ],
    [
      "a maximum length grew (the S/4HANA material number, 18 to 40)",
      contract("", '<Property Name="Material" Type="Edm.String" MaxLength="18"/>'),
      contract("", '<Property Name="Material" Type="Edm.String" MaxLength="40"/>'),
      { ID: "1", Material: "M".repeat(40) },
      "minor",
    ],
  ])("%s", (_label, before, after, row, bump) => {
    expect(diffContracts(before, after).bump).toBe(bump);
    expect(accepts(after, row)).toBe(true);
    // Minor exactly when the previous version's record schema still accepts the new row.
    expect(accepts(before, row)).toBe(bump === "minor");
  });

  it("a grown key length is minor and the previous key schema accepts the new key; a body still validates lengths", () => {
    const keyOf = (n: number) => `<Property Name="ID" Type="Edm.String" Nullable="false" MaxLength="${n}"/>`;
    const before = contract("", '<Property Name="Material" Type="Edm.String" MaxLength="18"/>', keyOf(4));
    const after = contract("", '<Property Name="Material" Type="Edm.String" MaxLength="18"/>', keyOf(8));
    expect(diffContracts(before, after).bump).toBe("minor");
    expect(validate(standaloneSchemas(before, "Orders").key!, { ID: "PLANT001" })).toBe(true);
    // What a write sends is still refused past its length: SAP would refuse it.
    expect(validate(standaloneSchemas(before, "Orders").create!, { ID: "1", Material: "M".repeat(19) })).toBe(false);
    expect(standaloneSchemas(before, "Orders").record.properties).toMatchObject({ Material: { "x-odata-max-length": 18 } });
  });
});
