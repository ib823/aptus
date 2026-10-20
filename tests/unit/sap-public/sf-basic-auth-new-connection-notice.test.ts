/**
 * The notice a NEW SuccessFactors Basic-auth connection gets on save (P0.9).
 *
 * SAP retires HTTP Basic for SuccessFactors APIs on 2026-11-20 — unsupported
 * and unavailable for new configurations from that day — and deletes it on a
 * tentative 2027-11-12. A consultant creating a Basic connection a month before
 * the first date was told nothing, and would have to redo it.
 *
 * The notice is dated in every phase, never refuses (Basic still answers until
 * deletion), and applies to SuccessFactors Basic only. The clock and the
 * environment are parameters, so every phase is tested without waiting for it.
 */

import { describe, expect, it } from "vitest";

import {
  newSuccessFactorsBasicConnectionNotice,
  SF_BASIC_AUTH_DELETION_ENV,
} from "@/lib/sap-public/sf-basic-auth-sunset";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const NO_ENV = {};

describe("before SAP's retirement date", () => {
  it("names both dates and how long is left, and points at SAML bearer", () => {
    const notice = newSuccessFactorsBasicConnectionNotice("successfactors", "basic", at("2026-10-20"), NO_ENV);
    expect(notice).not.toBeNull();
    expect(notice).toContain("2026-11-20");
    expect(notice).toContain("2027-11-12");
    expect(notice).toContain("31 day(s) from now");
    expect(notice).toMatch(/unavailable for new configurations/);
    expect(notice).toMatch(/OAuth SAML bearer/);
  });
});

describe("between retirement and deletion", () => {
  it("says Basic is retired, still answers, and when it stops", () => {
    const notice = newSuccessFactorsBasicConnectionNotice("successfactors", "basic", at("2027-01-01"), NO_ENV);
    expect(notice).toMatch(/retired HTTP Basic for SuccessFactors APIs on 2026-11-20/);
    expect(notice).toMatch(/still answers until 2027-11-12/);
    expect(notice).toMatch(/tentative/);
  });
});

describe("on and after the deletion date", () => {
  it("says every call will be refused, and how to track a moved date", () => {
    const notice = newSuccessFactorsBasicConnectionNotice("successfactors", "basic", at("2027-11-12"), NO_ENV);
    expect(notice).toMatch(/stopped accepting HTTP Basic for SuccessFactors on 2027-11-12/);
    expect(notice).toContain(SF_BASIC_AUTH_DELETION_ENV);
  });

  it("follows SAP when an operator has tracked a new deletion date", () => {
    const env = { [SF_BASIC_AUTH_DELETION_ENV]: "2028-06-30" };
    const notice = newSuccessFactorsBasicConnectionNotice("successfactors", "basic", at("2027-12-01"), env);
    expect(notice).toMatch(/still answers until 2028-06-30/);
  });
});

describe("scope", () => {
  it("is null for every other auth type on SuccessFactors", () => {
    for (const authType of ["oauth-saml-bearer", "bearer", "oauth-client-credentials", "api-key"]) {
      expect(
        newSuccessFactorsBasicConnectionNotice("successfactors", authType, at("2026-10-20"), NO_ENV),
        authType,
      ).toBeNull();
    }
  });

  it("is null for Basic on every other product — Basic is legitimate there", () => {
    for (const product of ["s4hana", "cloud-erp-private", "s4hana-onprem", "ecc", "ariba"]) {
      expect(newSuccessFactorsBasicConnectionNotice(product, "basic", at("2026-10-20"), NO_ENV), product).toBeNull();
    }
  });
});
