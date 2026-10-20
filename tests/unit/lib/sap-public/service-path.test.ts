/**
 * service-path.ts — what an interface's OWN service path may be.
 *
 * The path is joined verbatim onto a connection's baseUrl and the connection's
 * credentials travel with the request, so every rejection class below is a way
 * a typed string could have moved a credentialed request off the connection's
 * host, or out of the service root. Each is pinned with a concrete input; the
 * accepted shapes are the real ones SAP prints (ADT service binding, Gateway
 * /IWFND/MAINT_SERVICE, SuccessFactors).
 */

import { describe, expect, it } from "vitest";

import { buildSapUrl } from "@/lib/sap-public/sap-url";
import {
  customExternalId,
  CUSTOM_EXTERNAL_ID_PREFIX,
  inferODataVersion,
  isCustomExternalId,
  isODataVersion,
  MAX_SERVICE_PATH_LENGTH,
  SERVICE_PATH_MESSAGES,
  validateServicePath,
  type ServicePathRefusal,
} from "@/lib/sap-public/service-path";

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const NBSP = String.fromCharCode(0x00a0);
const ZERO_WIDTH = String.fromCharCode(0x200b);

const REFUSALS: ReadonlyArray<[string, unknown, ServicePathRefusal]> = [
  ["empty", "", "EMPTY"],
  ["not a string", 42, "EMPTY"],
  ["null", null, "EMPTY"],
  ["181 characters", "/" + "a".repeat(MAX_SERVICE_PATH_LENGTH), "TOO_LONG"],
  ["a space", "/a b", "WHITESPACE_OR_CONTROL"],
  ["a tab", "/a\tb", "WHITESPACE_OR_CONTROL"],
  ["a line separator", `/a${LINE_SEPARATOR}`, "WHITESPACE_OR_CONTROL"],
  ["a no-break space", `/a${NBSP}b`, "WHITESPACE_OR_CONTROL"],
  ["a zero-width space", `/a${ZERO_WIDTH}b`, "WHITESPACE_OR_CONTROL"],
  ["a NUL", "/a\u0000b", "WHITESPACE_OR_CONTROL"],
  ["a backslash", "\\sap", "BACKSLASH"],
  ["a backslash inside", "/sap\\..\\x", "BACKSLASH"],
  ["a query", "/x?sap-client=100", "QUERY_OR_FRAGMENT"],
  ["a fragment", "/x#f", "QUERY_OR_FRAGMENT"],
  ["a full https URL", "https://evil.com/x", "SCHEME"],
  ["a javascript: URL", "javascript:x", "SCHEME"],
  ["relative", "sap/opu", "NOT_ABSOLUTE"],
  ["dot-relative", "./sap", "NOT_ABSOLUTE"],
  ["protocol-relative host", "//evil.com/x", "HOST"],
  ["a colon", "/a:b", "DISALLOWED_CHARACTER"],
  ["an at sign", "/a@evil.com", "DISALLOWED_CHARACTER"],
  ["a quote", '/a"b', "DISALLOWED_CHARACTER"],
  ["a truncated escape", "/a%2", "BAD_ESCAPE"],
  ["a non-hex escape", "/a%zz", "BAD_ESCAPE"],
  ["encoded dot-dot", "/a/%2e%2e/b", "ENCODED_FORBIDDEN"],
  ["encoded slash", "/a%2fb", "ENCODED_FORBIDDEN"],
  ["double encoding", "/a%252e", "ENCODED_FORBIDDEN"],
  ["encoded backslash", "/a%5cb", "ENCODED_FORBIDDEN"],
  ["encoded query", "/a%3fx", "ENCODED_FORBIDDEN"],
  ["encoded fragment", "/a%23x", "ENCODED_FORBIDDEN"],
  ["encoded NUL", "/a%00", "ENCODED_FORBIDDEN"],
  ["an empty segment", "/a//b", "EMPTY_SEGMENT"],
  ["the root alone", "/", "EMPTY_SEGMENT"],
  ["a dot-dot segment", "/a/../b", "DOT_SEGMENT"],
  ["a dot segment", "/a/./b", "DOT_SEGMENT"],
  // Servlet containers and proxies strip ;params before normalising, so these
  // are `..` / `.` / an empty segment to them (review round 1).
  ["dot-dot with an empty parameter", "/sap/opu/odata/sap/ZX/..;", "DOT_SEGMENT"],
  ["dot-dot with a parameter", "/sap/opu/odata/sap/ZX/..;x=1", "DOT_SEGMENT"],
  ["dot with a parameter", "/sap/opu/odata/sap/ZX/.;", "DOT_SEGMENT"],
  ["dot-dot with a parameter mid-path", "/odata/v2/..;/..;/sfapi/v1/soap", "DOT_SEGMENT"],
  ["dot-dot with a version-shaped parameter", "/sap/opu/odata/sap/ZX/..;v=0002", "DOT_SEGMENT"],
  ["a parameter-only segment", "/sap/opu/odata/sap/ZX/;", "EMPTY_SEGMENT"],
  ["a parameter-only segment with a value", "/sap/opu/odata/sap/ZX/;v=0002", "EMPTY_SEGMENT"],
  ["an encoded semicolon", "/sap/opu/odata/sap/ZX%3bo=PRD", "ENCODED_FORBIDDEN"],
  // SAP routing that would overrule the connection's environment binding.
  ["a Gateway system alias", "/sap/opu/odata/sap/ZX;o=PRD_ALIAS", "ROUTING_PARAMETER"],
  ["a local system alias", "/sap/opu/odata/sap/ZX_SRV;o=LOCAL", "ROUTING_PARAMETER"],
  ["multi-origin", "/sap/opu/odata/sap/ZX;mo", "ROUTING_PARAMETER"],
  ["a client parameter", "/sap/opu/odata/sap/ZX;c=200", "ROUTING_PARAMETER"],
  ["a sap-client parameter", "/sap/opu/odata/sap/ZX;sap-client=200", "ROUTING_PARAMETER"],
  ["a version followed by an alias", "/sap/opu/odata/sap/ZX;v=0002;o=PRD", "ROUTING_PARAMETER"],
  ["a version of more than four digits", "/sap/opu/odata/sap/ZX;v=00002", "ROUTING_PARAMETER"],
  ["a version with no digits", "/sap/opu/odata/sap/ZX;v=", "ROUTING_PARAMETER"],
  ["a version on a non-final segment", "/sap/opu/odata/sap/ZX;v=0002/more", "ROUTING_PARAMETER"],
  ["an encoded alias key", "/sap/opu/odata/sap/ZX;%6f=PRD", "ROUTING_PARAMETER"],
  ["an ICF session segment", "/sap(bD1lbiZjPTIwMA==)/opu/odata/sap/ZX", "SESSION_SEGMENT"],
  ["an encoded ICF session segment", "/sap%28bD1lbiZjPTIwMA==%29/opu/odata/sap/ZX", "SESSION_SEGMENT"],
  ["a session segment second", "/x/sap(bD1lbiZjPTIwMA==)/opu/odata/sap/ZX", "SESSION_SEGMENT"],
  ["$metadata", "/x/$metadata", "SYSTEM_RESOURCE"],
  ["encoded $metadata", "/x/%24metadata", "SYSTEM_RESOURCE"],
  ["$batch", "/x/$batch", "SYSTEM_RESOURCE"],
  // Not an OData service: any other ICF handler, called with the connection's
  // credentials, would be served as records (review round 2).
  ["an ADT repository handler", "/sap/bc/adt/repository/nodestructure", "NOT_ODATA_ROOT"],
  ["the SOAP RFC handler", "/sap/bc/soap/rfc", "NOT_ODATA_ROOT"],
  ["the Web GUI", "/sap/bc/gui/sap/its/webgui", "NOT_ODATA_ROOT"],
  ["a public info handler", "/sap/public/info", "NOT_ODATA_ROOT"],
  ["the ping handler", "/sap/bc/ping", "NOT_ODATA_ROOT"],
  ["a customer REST handler", "/sap/bc/rest/ZHR_EMPLOYEES", "NOT_ODATA_ROOT"],
  ["the Gateway root alone", "/sap/opu/odata", "NOT_ODATA_ROOT"],
  ["the Gateway V4 root alone", "/sap/opu/odata4/", "NOT_ODATA_ROOT"],
  ["a look-alike root", "/sap/opu/odataX/sap/ZX", "NOT_ODATA_ROOT"],
  ["SuccessFactors below its root (a dataset typed into the path)", "/odata/v2/User", "DATASET_IN_PATH"],
  ["…in any case", "/ODATA/V2/cust_TravelRequest", "DATASET_IN_PATH"],
  ["a bare one-segment path", "/a", "NOT_ODATA_ROOT"],
];

describe("validateServicePath — every rejection class", () => {
  it.each(REFUSALS)("refuses %s", (_name, input, reason) => {
    const r = validateServicePath(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe(reason);
      expect(r.message).toBe(SERVICE_PATH_MESSAGES[reason]);
    }
  });

  it("covers every refusal reason with at least one input (NOT_NORMALIZED is a backstop)", () => {
    const covered = new Set(REFUSALS.map(([, , r]) => r));
    const all = Object.keys(SERVICE_PATH_MESSAGES) as ServicePathRefusal[];
    expect(all.filter((r) => !covered.has(r))).toEqual(["NOT_NORMALIZED"]);
  });

  it("never trims: a leading space is refused, not quietly accepted", () => {
    expect(validateServicePath(" /sap/opu/odata/sap/ZUI_X_O2").ok).toBe(false);
  });

  it("speaks plain language: the scheme message shows the path to enter instead", () => {
    expect(SERVICE_PATH_MESSAGES.SCHEME).toContain("/sap/opu/odata/sap/ZUI_TRAVEL_O2");
    expect(SERVICE_PATH_MESSAGES.QUERY_OR_FRAGMENT).toContain("CoreEdge adds sap-client itself");
  });
});

const ACCEPTED = [
  "/sap/opu/odata/sap/ZUI_X_O2",
  "/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001",
  "/odata/v2",
  "/sap/opu/odata/sap/YY1_SALESORDERX_CDS",
  "/sap/opu/odata/sap/ZX_SRV;v=0002",
  "/sap/opu/odata/SAP/ZX_SRV;v=0001",
  "/sap/opu/odata/sap/Z(X)",
  "/SAP/OPU/ODATA/SAP/ZX_SRV",
  "/odatav4/talent/learning/Course.svc/v1",
];

describe("validateServicePath — the shapes SAP prints are accepted", () => {
  it.each(ACCEPTED)("accepts %s unchanged", (p) => {
    expect(validateServicePath(p)).toEqual({ ok: true, path: p });
  });

  it("normalizes one trailing slash, so /x/ and /x are one identity", () => {
    expect(validateServicePath("/sap/opu/odata/sap/ZUI_X_O2/")).toEqual({
      ok: true,
      path: "/sap/opu/odata/sap/ZUI_X_O2",
    });
    expect(validateServicePath("/odata/v2/")).toEqual({ ok: true, path: "/odata/v2" });
  });

  it("stores one spelling: every %-escape is decoded, so one service has one id (review round 4)", () => {
    const cases: Array<[string, string]> = [
      ["/sap/opu/odata/sap/ZX;v=%30002", "/sap/opu/odata/sap/ZX;v=0002"],
      ["/sap/opu/odata/sap/ZX;v=0002", "/sap/opu/odata/sap/ZX;v=0002"],
      ["/sap/opu/odata/sap/ZX;%76=2", "/sap/opu/odata/sap/ZX;v=0002"],
      ["/sap/opu/odata/sap/ZX;v%3d2", "/sap/opu/odata/sap/ZX;v=0002"],
      ["/sap/opu/odata/sap/ZX;v=%32", "/sap/opu/odata/sap/ZX;v=0002"],
      ["/sap/opu/odata/%73ap/ZX", "/sap/opu/odata/sap/ZX"],
      ["/sap/opu/odata/sap/Z%28X%29", "/sap/opu/odata/sap/Z(X)"],
      ["/sap/opu/odata/sap/Z%5fX", "/sap/opu/odata/sap/Z_X"],
    ];
    for (const [raw, stored] of cases) {
      expect(validateServicePath(raw), raw).toEqual({ ok: true, path: stored });
      // The stored form validates to itself, so a stored row stays usable.
      expect(validateServicePath(stored), stored).toEqual({ ok: true, path: stored });
    }
  });

  it("decoding opens no refusal: an escaped dot, ; or routing key is still refused", () => {
    expect(validateServicePath("/sap/opu/odata/sap/ZX;v=%2e2")).toMatchObject({ ok: false, reason: "ENCODED_FORBIDDEN" });
    expect(validateServicePath("/sap/opu/odata/sap/ZX%3bv=2")).toMatchObject({ ok: false, reason: "ENCODED_FORBIDDEN" });
    expect(validateServicePath("/sap/opu/odata/sap/ZX;%6f=PRD")).toMatchObject({ ok: false, reason: "ROUTING_PARAMETER" });
  });

  it("accepts the short version form Gateway prints (;v=2) and stores it as ;v=0002 — one identity (review round 3)", () => {
    expect(validateServicePath("/sap/opu/odata/sap/ZTRAVEL_SRV;v=2")).toEqual({
      ok: true,
      path: "/sap/opu/odata/sap/ZTRAVEL_SRV;v=0002",
    });
    expect(validateServicePath("/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/")).toEqual({
      ok: true,
      path: "/sap/opu/odata/IWFND/CATALOGSERVICE;v=0002",
    });
    expect(validateServicePath("/sap/opu/odata/sap/ZX;v=12")).toEqual({ ok: true, path: "/sap/opu/odata/sap/ZX;v=0012" });
    // Normalizing is idempotent: the stored form validates to itself.
    expect(validateServicePath("/sap/opu/odata/sap/ZTRAVEL_SRV;v=0002")).toEqual({
      ok: true,
      path: "/sap/opu/odata/sap/ZTRAVEL_SRV;v=0002",
    });
  });

  it("refuses a short version whose four-digit form would pass the length limit", () => {
    const root = "/sap/opu/odata/sap/";
    const raw = `${root}${"Z".repeat(180 - root.length - ";v=2".length)};v=2`;
    expect(raw.length).toBe(180);
    expect(validateServicePath(raw)).toMatchObject({ ok: false, reason: "TOO_LONG" });
  });

  it("accepts the 180-character limit exactly", () => {
    const root = "/sap/opu/odata/sap/";
    const p = root + "A".repeat(MAX_SERVICE_PATH_LENGTH - root.length);
    expect(p).toHaveLength(MAX_SERVICE_PATH_LENGTH);
    expect(validateServicePath(p).ok).toBe(true);
  });

  it("never lets an accepted path move the request off the connection's host", () => {
    // The property the whole module exists for, checked through the real URL
    // builder every runtime path uses — with and without an SAP client.
    const bases = ["https://my404711-api.s4hana.cloud.sap", "https://erp.example.internal:44300"];
    for (const base of bases) {
      for (const p of ACCEPTED) {
        const check = validateServicePath(p);
        expect(check.ok).toBe(true);
        if (!check.ok) continue;
        for (const client of [null, "100"]) {
          const url = buildSapUrl({ baseUrl: base, path: `${check.path}/$metadata`, client });
          expect(new URL(url).origin, `${base} + ${p}`).toBe(new URL(base).origin);
          expect(new URL(url).pathname.startsWith(check.path)).toBe(true);
        }
      }
    }
  });
});

describe("the derived grant identity", () => {
  it("is custom:<path>", () => {
    expect(customExternalId("/sap/opu/odata/sap/ZUI_X_O2")).toBe("custom:/sap/opu/odata/sap/ZUI_X_O2");
    expect(CUSTOM_EXTERNAL_ID_PREFIX).toBe("custom:");
  });

  it("is recognised, and catalogue ids are not", () => {
    expect(isCustomExternalId("custom:/odata/v2")).toBe(true);
    expect(isCustomExternalId("API_BUSINESS_PARTNER")).toBe(false);
    expect(isCustomExternalId("CE_PURCHASEORDER_0001")).toBe(false);
  });

  it("fits the grant schema's 200-character bound at the longest path", () => {
    expect(customExternalId("/" + "a".repeat(MAX_SERVICE_PATH_LENGTH - 1)).length).toBeLessThanOrEqual(200);
  });
});

describe("inferODataVersion — a UI hint only", () => {
  it("reads /odata4/ and /odatav4/ as V4", () => {
    expect(inferODataVersion("/sap/opu/odata4/sap/zui_x_o4/srvd_a2x/sap/zx/0001")).toBe("V4");
    expect(inferODataVersion("/odatav4/x")).toBe("V4");
  });

  it("reads everything else as V2", () => {
    expect(inferODataVersion("/sap/opu/odata/sap/ZUI_X_O2")).toBe("V2");
    expect(inferODataVersion("/odata/v2")).toBe("V2");
    expect(inferODataVersion("")).toBe("V2");
  });

  it("isODataVersion accepts exactly V2 and V4", () => {
    expect(isODataVersion("V2")).toBe(true);
    expect(isODataVersion("V4")).toBe(true);
    expect(isODataVersion("v4")).toBe(false);
    expect(isODataVersion(null)).toBe(false);
  });
});
