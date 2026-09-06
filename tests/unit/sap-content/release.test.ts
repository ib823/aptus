/**
 * 2608 WS0 — SAP content release resolver.
 *
 * The release every SAP-grounded page and loader agrees on comes from ONE
 * function. These tests pin its contract: the default is 2608 since WS7,
 * 2602 stays selectable by env for an engagement that has not moved, garbage
 * is rejected rather than silently accepted, and the footer label is
 * verbatim.
 */

import { describe, expect, it } from "vitest";

import { APP_CONFIG } from "@/constants/config";
import {
  SAP_CONTENT_RELEASES,
  formatSapContentReleaseLabel,
  formatSapProductReleaseLabel,
  isSapContentReleaseCode,
  resolveSapContentRelease,
} from "@/lib/sap-content/release";

describe("resolveSapContentRelease", () => {
  it("defaults to APP_CONFIG.sapVersion (2608 since WS7) when SAP_CONTENT_RELEASE is unset", () => {
    const r = resolveSapContentRelease({});
    expect(r.release).toBe(APP_CONFIG.sapVersion);
    expect(r.release).toBe("2608");
    expect(r.fromEnv).toBe(false);
    expect(r.localisation).toBe("MY");
    expect(r.label).toBe("SAP content release 2608 · MY");
  });

  it("keeps 2602 selectable for an engagement that has not moved", () => {
    const r = resolveSapContentRelease({ SAP_CONTENT_RELEASE: "2602" });
    expect(r.release).toBe("2602");
    expect(r.fromEnv).toBe(true);
    expect(r.label).toBe("SAP content release 2602 · MY");
  });

  it("tolerates surrounding whitespace in the env value", () => {
    expect(resolveSapContentRelease({ SAP_CONTENT_RELEASE: " 2602 " }).release).toBe("2602");
  });

  it("falls back to the default (and says so) for an unknown release", () => {
    for (const bad of ["2605", "2702", "", "latest", "2608.1"]) {
      const r = resolveSapContentRelease({ SAP_CONTENT_RELEASE: bad });
      expect(r.release, bad).toBe("2608");
      expect(r.fromEnv, bad).toBe(false);
    }
  });

  it("the default release is always a known release", () => {
    expect(isSapContentReleaseCode(APP_CONFIG.sapVersion)).toBe(true);
    expect(SAP_CONTENT_RELEASES).toContain("2602");
    expect(SAP_CONTENT_RELEASES).toContain("2608");
  });

  it("formats the first-mention product label with marketing + technical name", () => {
    expect(formatSapProductReleaseLabel("2608")).toBe(
      "SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release 2608",
    );
    expect(resolveSapContentRelease({ SAP_CONTENT_RELEASE: "2608" }).productLabel).toContain("content release 2608");
  });

  it("formats the footer label exactly as the master prompt specifies", () => {
    expect(formatSapContentReleaseLabel("2608")).toBe("SAP content release 2608 · MY");
    expect(formatSapContentReleaseLabel("2602")).toBe("SAP content release 2602 · MY");
  });
});
