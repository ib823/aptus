// @vitest-environment node
/**
 * Reading SAP's answer by kind (P1.4, 3.8.3): V2 and V4 lists, key lookups
 * (a V4 entity with properties named `value` and `error`), the count in both
 * spellings, the "more rows" signal with and without a next link, and the
 * projection — including `__proto__` keys in SAP's row and fields SAP
 * returned without being asked. No next link ever reaches the output.
 */

import { describe, expect, it } from "vitest";

import { readQueryAnswer } from "@/lib/odata/response";
import type { SapQuery } from "@/lib/odata/operation-compiler";

const HOST = "https://sap-host-canary-7f3a.example.invalid:44300";

type Q = Pick<SapQuery, "kind" | "odata" | "project" | "selectSent" | "keyParts">;

const list = (odata: "V2" | "V4", over: Partial<Q> = {}): Q => ({ kind: "LIST", odata, project: ["Id", "Name"], selectSent: ["Id", "Name"], keyParts: ["Id"], ...over });

function rows(r: ReturnType<typeof readQueryAnswer>) {
  if (!r.ok) throw new Error("not ok");
  return r.rows.map((x) => ({ ...x.record }));
}

describe("lists", () => {
  it("V2: d.results, __count as a string, __next as a yes", () => {
    const body = {
      d: {
        results: [
          { __metadata: { uri: `${HOST}/x('1')` }, Id: "1", Name: "a", to_X: { __deferred: { uri: `${HOST}/x('1')/to_X` } } },
          { __metadata: { uri: `${HOST}/x('2')` }, Id: "2", Name: "b" },
        ],
        __count: "1873",
        __next: `${HOST}/x?$skiptoken=2`,
      },
    };
    const r = readQueryAnswer(body, list("V2"), true);
    expect(r.ok && r.more).toBe(true);
    expect(r.ok && r.totalCount).toBe(1873);
    expect(rows(r)).toEqual([
      { Id: "1", Name: "a" },
      { Id: "2", Name: "b" },
    ]);
    expect(JSON.stringify(r)).not.toContain("canary");
    expect(readQueryAnswer({ d: { results: [] } }, list("V2"), true)).toEqual({ ok: true, rows: [], more: false, totalCount: null, projected: false });
  });

  it("V4: value, @odata.count as a number or a digit string, @odata.nextLink as a yes", () => {
    const body = {
      "@odata.context": `${HOST}/$metadata#X`,
      "@odata.count": 12,
      "@odata.nextLink": `${HOST}/X?$skiptoken=1`,
      value: [{ "@odata.etag": "W/1", "@odata.id": `${HOST}/X('1')`, "@id": `${HOST}/X('1')`, Id: "1", Name: "a" }],
    };
    const r = readQueryAnswer(body, list("V4"), true);
    expect(r.ok && r.more).toBe(true);
    expect(r.ok && r.totalCount).toBe(12);
    expect(rows(r)).toEqual([{ Id: "1", Name: "a" }]);
    expect(JSON.stringify(r)).not.toContain("canary");
    // IEEE754Compatible: a string; a digit string past 15 digits is not exact as a number, so it is not a count.
    const ieee = readQueryAnswer({ "@odata.count": "123456789012345", value: [] }, list("V4"), true);
    expect(ieee.ok && ieee.totalCount).toBe(123456789012345);
    expect(readQueryAnswer({ "@odata.count": "9007199254740993", value: [] }, list("V4"), true)).toMatchObject({ totalCount: null });
    // A relative next link, and a 4.01 one without the prefix, are a yes as well.
    expect(readQueryAnswer({ "@odata.nextLink": "X?$skiptoken=1", value: [] }, list("V4"), false)).toMatchObject({ ok: true, more: true });
    expect(readQueryAnswer({ "@nextLink": "X?$skiptoken=1", value: [] }, list("V4"), false)).toMatchObject({ ok: true, more: true });
  });

  it("a count is read only when it was asked, and only in its expected shapes", () => {
    expect(readQueryAnswer({ d: { results: [], __count: "5" } }, list("V2"), false)).toMatchObject({ totalCount: null });
    for (const bad of [5, "-1", "1e3", "", "1234567890123456"]) {
      expect(readQueryAnswer({ d: { results: [], __count: bad } }, list("V2"), true)).toMatchObject({ ok: true, totalCount: null });
    }
    for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 2, "x"]) {
      expect(readQueryAnswer({ value: [], "@odata.count": bad }, list("V4"), true)).toMatchObject({ ok: true, totalCount: null });
    }
  });

  it("refuses a body of the wrong shape", () => {
    for (const body of [null, [], "x", { d: {} }, { d: { results: [1] } }, { value: {} }, { value: [null] }, { error: { message: `${HOST}` } }]) {
      expect(readQueryAnswer(body, list("V2"), false).ok && readQueryAnswer(body, list("V4"), false).ok).toBe(false);
    }
    expect(readQueryAnswer({ d: { results: [] } }, list("V4"), false)).toEqual({ ok: false, reason: "INVALID_UPSTREAM_BODY" });
    expect(readQueryAnswer({ value: [] }, list("V2"), false)).toEqual({ ok: false, reason: "INVALID_UPSTREAM_BODY" });
  });
});

describe("key lookups", () => {
  const key = (odata: "V2" | "V4"): Q => ({ kind: "KEY", odata, project: ["Id", "value", "error"], selectSent: null, keyParts: ["Id"] });

  it("V2: d is the entity; d with results is the wrong shape", () => {
    const r = readQueryAnswer({ d: { __metadata: { uri: `${HOST}/x('1')` }, Id: "1", value: "v" } }, key("V2"), false);
    expect(rows(r)).toEqual([{ Id: "1", value: "v" }]);
    expect(readQueryAnswer({ d: { results: [] } }, key("V2"), false).ok).toBe(false);
  });

  it("V4: the top-level object is the entity, whatever properties it has", () => {
    const body = { "@odata.context": `${HOST}/$metadata#X/$entity`, Id: "1", value: ["not", "rows"], error: "a field" };
    const r = readQueryAnswer(body, key("V4"), false);
    expect(rows(r)).toEqual([{ Id: "1", value: ["not", "rows"], error: "a field" }]);
  });

  it("the key fallback is read as a list", () => {
    const via: Q = { kind: "KEY_VIA_FILTER", odata: "V2", project: ["Id"], selectSent: ["Id"], keyParts: ["Id"] };
    const r = readQueryAnswer({ d: { results: [{ Id: "A/1" }, { Id: "A/1" }] } }, via, false);
    expect(r.ok && r.rows.length).toBe(2);
  });
});

describe("the projection", () => {
  it("copies only the projected fields, in policy order, into null-prototype rows", () => {
    const r = readQueryAnswer({ d: { results: [{ Secret: "s", Name: "a", Id: "1" }] } }, list("V2", { selectSent: null }), false);
    if (!r.ok) throw new Error("not ok");
    const record = r.rows[0]!.record;
    expect(Object.getPrototypeOf(record)).toBeNull();
    expect(Object.keys(record)).toEqual(["Id", "Name"]);
    expect(r.projected).toBe(true);
  });

  it("a service that ignores $select is projected and flagged", () => {
    const r = readQueryAnswer({ value: [{ Id: "1", Name: "a", Salary: 100 }] }, list("V4"), false);
    expect(rows(r)).toEqual([{ Id: "1", Name: "a" }]);
    expect(r.ok && r.projected).toBe(true);
    expect(readQueryAnswer({ value: [{ Id: "1", Name: "a" }] }, list("V4"), false)).toMatchObject({ projected: false });
  });

  it("key parts sent for the overlap check are dropped from the record and kept in its key", () => {
    const q = list("V2", { project: ["Name"], selectSent: ["Id", "Name"], keyParts: ["Id"] });
    const r = readQueryAnswer({ d: { results: [{ Id: "1", Name: "a" }] } }, q, false);
    if (!r.ok) throw new Error("not ok");
    expect({ ...r.rows[0]!.record }).toEqual({ Name: "a" });
    expect(r.rows[0]!.keyText).toBe('["1"]');
    expect(r.projected).toBe(false);
  });

  it("a __proto__ key in SAP's row is never copied and pollutes nothing", () => {
    const body = JSON.parse('{"d":{"results":[{"__proto__":{"polluted":true},"Id":"1","Name":"a"}]}}') as unknown;
    const r = readQueryAnswer(body, list("V2"), false);
    if (!r.ok) throw new Error("not ok");
    const record = r.rows[0]!.record;
    expect(Object.keys(record)).toEqual(["Id", "Name"]);
    expect((record as { polluted?: boolean }).polluted).toBeUndefined();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(r.projected).toBe(true);
  });

  it("a missing field is left out, not invented; a null is kept", () => {
    const r = readQueryAnswer({ value: [{ Id: "1", Name: null }, { Id: "2" }] }, list("V4"), false);
    expect(rows(r)).toEqual([{ Id: "1", Name: null }, { Id: "2" }]);
  });

  it("composite keys, canonical", () => {
    const q = list("V2", { keyParts: ["Order", "Line"], project: ["Order", "Line"], selectSent: ["Order", "Line"] });
    const r = readQueryAnswer({ d: { results: [{ Line: "10", Order: "1" }, { Order: "2" }] } }, q, false);
    if (!r.ok) throw new Error("not ok");
    expect(r.rows.map((x) => x.keyText)).toEqual(['["1","10"]', '["2",null]']);
  });
});
