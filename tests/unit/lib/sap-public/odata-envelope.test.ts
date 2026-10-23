/**
 * SAP's OData envelope never leaves with a record.
 *
 * Every key this removes is an absolute URL on the connection's own host — the
 * host the broker exists to keep from the developer's app. The business fields
 * around them must come through untouched, or the fix would be a data loss
 * dressed as a privacy measure.
 */

import { describe, expect, it } from "vitest";

import { stripODataEnvelope } from "@/lib/sap-public/odata-envelope";

const HOST = "https://my403706-api.s4hana.cloud.sap";
const SVC = `${HOST}/sap/opu/odata/sap/API_BUSINESS_PARTNER`;

const V2_ROW = {
  __metadata: {
    id: `${SVC}/A_BusinessPartner('1')`,
    uri: `${SVC}/A_BusinessPartner('1')`,
    type: "API_BUSINESS_PARTNER.A_BusinessPartnerType",
    media_src: `${SVC}/A_BusinessPartner('1')/$value`,
    edit_media: `${SVC}/A_BusinessPartner('1')/$value`,
  },
  BusinessPartner: "1",
  BusinessPartnerName: "Acme",
  CreationDate: "/Date(1690000000000)/",
  to_BusinessPartnerAddress: { __deferred: { uri: `${SVC}/A_BusinessPartner('1')/to_BusinessPartnerAddress` } },
  to_BusinessPartnerRole: { __deferred: { uri: `${SVC}/A_BusinessPartner('1')/to_BusinessPartnerRole` } },
};

describe("a V2 row", () => {
  it("loses __metadata and every unexpanded navigation, and nothing else", () => {
    expect(stripODataEnvelope(V2_ROW)).toEqual({
      BusinessPartner: "1",
      BusinessPartnerName: "Acme",
      CreationDate: "/Date(1690000000000)/",
    });
  });

  it("carries the host nowhere", () => {
    expect(JSON.stringify(stripODataEnvelope(V2_ROW))).not.toContain("s4hana.cloud.sap");
  });

  it("strips an expanded navigation's rows too, without reshaping it", () => {
    const row = {
      BusinessPartner: "1",
      to_BusinessPartnerAddress: {
        results: [{ __metadata: { uri: `${SVC}/A_BusinessPartnerAddress('9')` }, AddressID: "9" }],
        __next: `${SVC}/A_BusinessPartner('1')/to_BusinessPartnerAddress?$skiptoken=1`,
        __count: "3",
      },
      to_Customer: { __metadata: { uri: `${SVC}/A_Customer('1')` }, Customer: "1" },
    };
    const out = stripODataEnvelope(row);
    expect(out).toEqual({
      BusinessPartner: "1",
      // Still `{ results }` — the shape a V2 consumer parses — but its rows and
      // its paging link no longer address SAP. `__count` is a number, not a URL.
      to_BusinessPartnerAddress: { results: [{ AddressID: "9" }], __count: "3" },
      to_Customer: { Customer: "1" },
    });
    expect(JSON.stringify(out)).not.toContain("s4hana.cloud.sap");
  });

  it("keeps a complex-typed property and a genuine null", () => {
    const row = { Amount: { Value: "10.00", Currency: "EUR" }, Note: null, Tags: ["a", "b"] };
    expect(stripODataEnvelope(row)).toEqual(row);
  });
});

describe("a V4 row", () => {
  it("loses every @odata.* key, on the row and on a property", () => {
    const row = {
      "@odata.context": `${HOST}/sap/opu/odata4/sap/x/$metadata#PurchaseOrder/$entity`,
      "@odata.etag": 'W/"20260101"',
      "@odata.id": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')`,
      "@odata.editLink": "PurchaseOrder('4500000123')",
      "_Item@odata.navigationLink": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')/_Item`,
      "_Item@odata.associationLink": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')/_Item/$ref`,
      PurchaseOrder: "4500000123",
      _Item: [{ "@odata.etag": 'W/"1"', PurchaseOrderItem: "10" }],
    };
    const out = stripODataEnvelope(row);
    expect(out).toEqual({ PurchaseOrder: "4500000123", _Item: [{ PurchaseOrderItem: "10" }] });
    expect(JSON.stringify(out)).not.toContain("s4hana.cloud.sap");
  });
});

it("does not modify the row it was given", () => {
  const row = structuredClone(V2_ROW);
  stripODataEnvelope(row);
  expect(row).toEqual(V2_ROW);
});

describe("OData 4.01 control information (P1.4)", () => {
  it("loses every key carrying @, prefixed or not", () => {
    const row = {
      "@context": `${HOST}/sap/opu/odata4/sap/x/$metadata#PurchaseOrder/$entity`,
      "@id": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')`,
      "@editLink": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')`,
      "_Item@navigationLink": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')/_Item`,
      "_Item@nextLink": `${HOST}/sap/opu/odata4/sap/x/PurchaseOrder('4500000123')/_Item?$skiptoken=1`,
      PurchaseOrder: "4500000123",
      Address: { "@type": "#x.Address", "@id": `${HOST}/x`, Street: "Main" },
    };
    const out = stripODataEnvelope(row);
    expect(out).toEqual({ PurchaseOrder: "4500000123", Address: { Street: "Main" } });
    expect(JSON.stringify(out)).not.toContain("s4hana.cloud.sap");
  });
});

describe("a row with a property named __proto__", () => {
  it("keeps it as a field and leaves the prototype alone", () => {
    const row = JSON.parse('{"__proto__":{"polluted":true},"Name":"x"}') as Record<string, unknown>;
    const out = stripODataEnvelope(row);
    expect(Object.keys(out)).toEqual(["__proto__", "Name"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: boolean }).polluted).toBeUndefined();
    expect(JSON.stringify(out)).toBe('{"__proto__":{"polluted":true},"Name":"x"}');
  });
});
