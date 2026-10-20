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

describe("SuccessFactors API servers (P0.9)", () => {
  /*
   * SAP KBA 2215682, "List of SAP SuccessFactors API Servers", as checked on
   * 2026-10-20: every Production, Preview, SalesDemo and EDR host. Most of them
   * are on `sapsf.*`, which was missing — so a real SuccessFactors tenant, the
   * product the SAML-bearer path exists for, could not be connected.
   */
  const KBA_2215682_HOSTS = [
    "api16.sapsf.eu",
    "api18.sapsf.com",
    "api18preview.sapsf.com",
    "api22.sapsf.com",
    "api22preview.sapsf.com",
    "api23.sapsf.com",
    "api23preview.sapsf.com",
    "api15.sapsf.cn",
    "api15preview.sapsf.cn",
    "api012.successfactors.eu",
    "api12preview.sapsf.eu",
    "apirot.successfactors.eu",
    "api40sales.sapsf.com",
    "api41.sapsf.com",
    "api41preview.sapsf.com",
    "api42.sapsf.com",
    "api42preview.sapsf.com",
    "api47.sapsf.com",
    "api47preview.sapsf.com",
    "api50.sapsf.com",
    "api50preview.sapsf.com",
    "api44.sapsf.com",
    "api44preview.sapsf.com",
    "api55.sapsf.eu",
    "api55preview.sapsf.eu",
    "api2.successfactors.eu",
    "api2preview.sapsf.eu",
    "apisalesdemo2.successfactors.eu",
    "api17.sapsf.com",
    "api17preview.sapsf.com",
    "api19.sapsf.com",
    "api19preview.sapsf.com",
    "api10.successfactors.com",
    "api10preview.sapsf.com",
    "api4.successfactors.com",
    "api4preview.sapsf.com",
    "api68sales.successfactors.com",
    "api8.successfactors.com",
    "api8preview.sapsf.com",
    "apisalesdemo8.successfactors.com",
    "api74.sapsf.eu",
    "api74preview.sapsf.eu",
    "api-in10.hr.cloud.sap",
    "api-in10-preview.hr.cloud.sap",
    "api-sa20.hr.cloud.sap",
    "api-sa20-preview.hr.cloud.sap",
    // EDR (disaster recovery) servers.
    "api32dr.sapsf.com",
    "api34dr.successfactors.eu",
    "api51dr.sapsf.com",
    "api56dr.sapsf.eu",
    "api58dr.successfactors.eu",
    "api61dr.sapsf.com",
    "api67dr.successfactors.com",
    "api69dr.successfactors.com",
    "api71dr.successfactors.com",
    "api-in11-dr.hr.cloud.sap",
  ];

  it("admits api17.sapsf.com, the roadmap's named host, with its OData path", () => {
    const v = checkSapHost("https://api17.sapsf.com/odata/v2/User?$top=1");
    expect(v).toEqual({ allowed: true, matched: "sapsf.com" });
  });

  it("admits the EU and China domains", () => {
    expect(checkSapHost("https://api55.sapsf.eu").allowed).toBe(true);
    expect(checkSapHost("https://api15.sapsf.cn").allowed).toBe(true);
  });

  it("admits every API server in SAP's published list", () => {
    for (const host of KBA_2215682_HOSTS) {
      expect(checkSapHost(`https://${host}`).allowed, host).toBe(true);
    }
  });

  it("matches on a label boundary, not on a string suffix", () => {
    for (const url of [
      // Ends with the suffix, but the label before it is not `sapsf`.
      "https://evil-sapsf.com",
      "https://api17.evil-sapsf.com",
      "https://notsapsf.eu",
      "https://xsapsf.cn",
      // Starts with the real domain, but the registrable domain is the attacker's.
      "https://sapsf.com.evil.io",
      "https://api17.sapsf.com.evil.io",
      "https://api15.sapsf.cn.attacker.example",
      // A neighbouring TLD that SAP does not serve from.
      "https://api17.sapsf.co",
      "https://api17.sapsf.net",
    ]) {
      expect(checkSapHost(url).allowed, url).toBe(false);
    }
  });

  it("still refuses http on a SuccessFactors host", () => {
    expect(checkSapHost("http://api17.sapsf.com").allowed).toBe(false);
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
