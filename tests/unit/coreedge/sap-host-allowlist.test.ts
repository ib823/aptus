/**
 * The SAP host allowlist (PR-5, capability 6).
 *
 * The audit (F25) found a DENY-list where the design specifies an ALLOW-list:
 * "https is required and localhost/… are refused, but ANY OTHER https host may
 * be saved — there is no positive list of SAP domains."
 *
 * A deny-list answers "is this one of the hosts we know is bad". Only an
 * allow-list refuses `https://sap-s4-prod.attacker.example`, which passes every
 * check that existed before this.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SAP_HOST_SUFFIXES, checkSapHost, configuredExtraSuffixes } from "@/lib/studio/sap-host-allowlist";

describe("hosts SAP actually serves from", () => {
  it("admits the real ones", () => {
    for (const url of [
      "https://my300000.s4hana.cloud.sap/sap/opu/odata/sap/API_X",
      "https://tenant.hana.ondemand.com",
      "https://acme.successfactors.com",
      "https://buyer.ariba.com",
    ]) {
      expect(checkSapHost(url).allowed, url).toBe(true);
    }
  });

  it("refuses a plausible-looking host that is not SAP's", () => {
    /*
     * THE ASSERTION THIS MODULE EXISTS FOR. Every check that existed before
     * passed this URL: it is https, it is not localhost, it is not an IP
     * literal, and it reads like an SAP system.
     */
    const v = checkSapHost("https://sap-s4-prod.attacker.example/sap/opu/odata");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain("not a SAP-served host");
  });
});

describe("suffix matching is anchored", () => {
  it("does not admit a host that merely ends with an allowed suffix", () => {
    // The classic suffix bug: `endsWith("ondemand.com")` admits
    // `evil-ondemand.com`, which is a completely different domain.
    expect(checkSapHost("https://evil-ondemand.com").allowed).toBe(false);
    expect(checkSapHost("https://notcloud.sap.com.attacker.example").allowed).toBe(false);
  });

  it("admits the suffix itself and any subdomain of it", () => {
    expect(checkSapHost("https://cloud.sap").allowed).toBe(true);
    expect(checkSapHost("https://a.b.c.cloud.sap").allowed).toBe(true);
  });
});

describe("deny still runs first", () => {
  it("refuses localhost, internal names and IP literals whatever the list says", () => {
    // The two are not alternatives. Keeping the deny-list means a future
    // allowlist entry that is too broad cannot re-admit these.
    for (const url of [
      "https://localhost",
      "https://sap.internal",
      "https://10.0.0.5",
      "https://[::1]",
    ]) {
      expect(checkSapHost(url).allowed, url).toBe(false);
    }
  });

  it("refuses http even for an allowed host", () => {
    const v = checkSapHost("http://tenant.hana.ondemand.com");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain("https");
  });

  it("refuses something that is not a URL at all", () => {
    expect(checkSapHost("not a url").allowed).toBe(false);
  });
});

describe("the list can be extended but not switched off", () => {
  it("adds configured suffixes", () => {
    const env = { SAP_HOST_ALLOWLIST_EXTRA: "sap.acme-corp.net" } as unknown as NodeJS.ProcessEnv;
    expect(checkSapHost("https://prod.sap.acme-corp.net", env).allowed).toBe(true);
    // And still refuses everything else.
    expect(checkSapHost("https://sap-s4-prod.attacker.example", env).allowed).toBe(false);
  });

  it("tolerates whitespace and leading dots in configuration", () => {
    const env = { SAP_HOST_ALLOWLIST_EXTRA: " .sap.acme.net , other.example " } as unknown as NodeJS.ProcessEnv;
    expect(configuredExtraSuffixes(env)).toEqual(["sap.acme.net", "other.example"]);
  });

  it("has no way to disable the check", () => {
    /*
     * A security control that cannot be configured gets removed rather than
     * configured — hence the extra-suffix escape hatch. But there is no
     * "allow everything" value, because an off switch is what gets left on.
     */
    // Comments stripped: a naive /\*/ matches every JSDoc marker in the file,
    // and prose describing the rule is not the rule being broken.
    const src = readFileSync(
      path.resolve(process.cwd(), "src/lib/studio/sap-host-allowlist.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(src, "an off switch is what gets left on").not.toMatch(
      /DISABLE|SKIP_HOST|ALLOW_ALL|BYPASS/i,
    );
    const env = { SAP_HOST_ALLOWLIST_EXTRA: "*" } as unknown as NodeJS.ProcessEnv;
    expect(checkSapHost("https://sap-s4-prod.attacker.example", env).allowed).toBe(false);
  });

  it("is not empty, so the guard cannot pass vacuously", () => {
    expect(SAP_HOST_SUFFIXES.length).toBeGreaterThan(5);
  });
});

describe("the refusal is useful to the person reading it", () => {
  it("says what to do about a private landscape", () => {
    const v = checkSapHost("https://sap.acme-corp.net");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain("SAP_HOST_ALLOWLIST_EXTRA");
  });
});
