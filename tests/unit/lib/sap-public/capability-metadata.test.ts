import { describe, expect, it } from "vitest";
import { detectMetadataFlavor, parseEntityCapabilities } from "@/lib/sap-public/tdd-connector";
import { deriveCapabilityLadder } from "@/lib/sap-public/capability-probe";

const V2_METADATA = `<?xml version="1.0"?>
<edmx:Edmx Version="1.0" xmlns:sap="http://www.sap.com/Protocols/SAPData">
  <EntitySet Name="A_PurchaseOrder" EntityType="X.PO" sap:creatable="true" sap:updatable="true" sap:deletable="false" sap:pageable="true"/>
  <EntitySet Name="A_ReadOnly" EntityType="X.RO" sap:creatable="false" sap:updatable="false" sap:deletable="false"/>
  <EntitySet Name="A_Default" EntityType="X.D"/>
</edmx:Edmx>`;

const V4_METADATA = `<?xml version="1.0"?>
<edmx:Edmx Version="4.0">
  <EntitySet Name="Orders" EntityType="X.Order"/>
  <EntitySet Name="Bare" EntityType="X.Bare"/>
  <Annotations Target="NS.Container/Orders">
    <Annotation Term="Org.OData.Capabilities.V1.InsertRestrictions"><Record><PropertyValue Property="Insertable" Bool="true"/></Record></Annotation>
    <Annotation Term="Org.OData.Capabilities.V1.DeleteRestrictions"><Record><PropertyValue Property="Deletable" Bool="false"/></Record></Annotation>
  </Annotations>
</edmx:Edmx>`;

describe("parseEntityCapabilities — OData V2 (reliable)", () => {
  const caps = parseEntityCapabilities(V2_METADATA);
  const byName = Object.fromEntries(caps.map((c) => [c.name, c]));

  it("detects the v2 flavor", () => {
    expect(detectMetadataFlavor(V2_METADATA)).toBe("v2");
  });

  it("reads explicit sap:* flags", () => {
    expect(byName.A_PurchaseOrder).toMatchObject({ creatable: true, updatable: true, deletable: false, pageable: true, readable: true });
    expect(byName.A_ReadOnly).toMatchObject({ creatable: false, updatable: false, deletable: false });
  });

  it("treats omitted flags as true (SAP V2 default)", () => {
    expect(byName.A_Default).toMatchObject({ creatable: true, updatable: true, deletable: true, pageable: true, readable: true });
  });
});

describe("parseEntityCapabilities — OData V4 (best-effort, flagged)", () => {
  const caps = parseEntityCapabilities(V4_METADATA);
  const byName = Object.fromEntries(caps.map((c) => [c.name, c]));

  it("detects the v4-best-effort flavor", () => {
    expect(detectMetadataFlavor(V4_METADATA)).toBe("v4-best-effort");
  });

  it("reads only what the Capabilities annotations state; unconfirmed = null", () => {
    // Orders has explicit Insertable=true, Deletable=false, and NO UpdateRestrictions.
    expect(byName.Orders).toMatchObject({ creatable: true, deletable: false, updatable: null, readable: true });
    // Bare has no annotations → all write flags null (never inferred writable).
    expect(byName.Bare).toMatchObject({ creatable: null, updatable: null, deletable: null, readable: true });
  });
});

describe("deriveCapabilityLadder", () => {
  it("unreachable when not exposed", () => {
    expect(deriveCapabilityLadder(false, [])).toBe("unreachable");
  });
  it("writable requires an explicit creatable=true", () => {
    expect(deriveCapabilityLadder(true, parseEntityCapabilities(V2_METADATA))).toBe("writable");
  });
  it("readable when readable but no creatable entity", () => {
    const readOnly = parseEntityCapabilities(V2_METADATA).filter((c) => c.name === "A_ReadOnly");
    expect(deriveCapabilityLadder(true, readOnly)).toBe("readable");
  });
  it("V4 best-effort null creatable does NOT read as writable", () => {
    const bare = parseEntityCapabilities(V4_METADATA).filter((c) => c.name === "Bare");
    expect(deriveCapabilityLadder(true, bare)).toBe("readable");
  });
});
