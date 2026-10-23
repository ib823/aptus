// @vitest-environment node
/**
 * The query surface's outcomes (P1.4, 3.8.2): every QueryReadStatus has an
 * HTTP status and a code; the legacy five map exactly as read-status.ts does;
 * and the legacy vocabulary the Test Console's fixtures switch over is
 * untouched.
 */

import { describe, expect, it } from "vitest";

import {
  httpStatusForQuery,
  QUERY_READ_STATUSES,
  queryErrorCodeFor,
  queryOutcomeDetail,
  queryRuleForStatus,
  queryStatusForHttp,
} from "@/lib/odata/query-status";
import { httpStatusFor, northboundErrorCodeFor, type NorthboundReadStatus } from "@/lib/northbound/read-status";
import { READ_STATUSES } from "@/lib/studio/fixtures";

const LEGACY: NorthboundReadStatus[] = ["OK", "EMPTY", "NEEDS_SETUP", "NOT_FOUND", "TIMEOUT", "ERROR"];

describe("statuses and codes", () => {
  it("every outcome has an HTTP status, and every failure a code", () => {
    for (const s of QUERY_READ_STATUSES) {
      expect(httpStatusForQuery(s)).toBeGreaterThanOrEqual(200);
      if (s !== "OK" && s !== "EMPTY") expect(queryErrorCodeFor(s)).toMatch(/^[A-Z_]+$/);
    }
    expect(new Set(QUERY_READ_STATUSES).size).toBe(9);
  });

  it("the legacy five map exactly as read-status.ts", () => {
    for (const s of LEGACY) {
      expect(httpStatusForQuery(s)).toBe(httpStatusFor(s));
      if (s !== "OK" && s !== "EMPTY") expect(queryErrorCodeFor(s)).toBe(northboundErrorCodeFor(s));
    }
  });

  it("the query surface's own three", () => {
    expect([httpStatusForQuery("NO_RECORD"), queryErrorCodeFor("NO_RECORD")]).toEqual([404, "RECORD_NOT_FOUND"]);
    expect([httpStatusForQuery("SAP_REJECTED"), queryErrorCodeFor("SAP_REJECTED")]).toEqual([422, "VALIDATION_ERROR"]);
    expect([httpStatusForQuery("TOO_LARGE"), queryErrorCodeFor("TOO_LARGE")]).toEqual([422, "VALIDATION_ERROR"]);
    expect(queryRuleForStatus("SAP_REJECTED")).toBe("SAP_REJECTED");
    expect(queryRuleForStatus("TOO_LARGE")).toBe("UPSTREAM_PAGE_TOO_LARGE");
    expect(queryRuleForStatus("ERROR")).toBeNull();
  });

  it("leaves the fixtures' read statuses as they were", () => {
    expect([...READ_STATUSES]).toEqual(LEGACY);
  });
});

describe("classifying SAP's answer by the kind of query sent", () => {
  it.each([
    [401, "LIST", "NEEDS_SETUP"],
    [403, "KEY", "NEEDS_SETUP"],
    [404, "LIST", "NOT_FOUND"],
    [404, "KEY", "NO_RECORD"],
    [404, "KEY_VIA_FILTER", "NOT_FOUND"],
    [400, "LIST", "SAP_REJECTED"],
    [405, "KEY", "SAP_REJECTED"],
    [406, "LIST", "SAP_REJECTED"],
    [412, "LIST", "SAP_REJECTED"],
    [422, "LIST", "SAP_REJECTED"],
    [501, "KEY_VIA_FILTER", "SAP_REJECTED"],
    [301, "LIST", "ERROR"],
    [302, "KEY", "ERROR"],
    [500, "LIST", "ERROR"],
    [502, "LIST", "ERROR"],
    [503, "LIST", "ERROR"],
    [504, "LIST", "ERROR"],
    [429, "LIST", "ERROR"],
  ] as const)("HTTP %i on a %s is %s", (http, kind, status) => {
    expect(queryStatusForHttp(http, kind)).toBe(status);
  });

  it("the details name no SAP text, URL or host", () => {
    expect(queryOutcomeDetail("SAP_REJECTED", 400)).toBe("The SAP service refused this query (HTTP 400). Change the query; retrying it unchanged will not help.");
    expect(queryOutcomeDetail("NO_RECORD", 404)).toBe("SAP has no record with this key.");
    expect(queryOutcomeDetail("TOO_LARGE", null)).toContain("16 MB");
  });
});
