/**
 * SuccessFactors auth, and the four places that enumerate an auth type.
 *
 * WHY THIS EXISTS AT ALL. SAP is REMOVING HTTP Basic authentication for
 * SuccessFactors APIs on 20 November 2026. The replacements are OAuth 2.0 SAML
 * bearer assertion, X.509 mutual TLS, or OIDC via IAS. This product's auth types
 * were basic | bearer | oauth-client-credentials — none of which is any of them.
 * So every SuccessFactors connection the product could express was configured
 * for a method with a published removal date.
 *
 * WHAT IS AND IS NOT VERIFIED HERE. The request SHAPE is from SAP's published
 * documentation; no SuccessFactors tenant was available, so the exchange has
 * never been observed end to end. What these tests pin is everything that can be
 * established without one: that a misconfiguration names the missing field, that
 * the assertion is never echoed into an error, that the token is cached, and
 * that the four enumerations of the auth type agree.
 *
 * The end-to-end exchange needs a real tenant. The connection test is the
 * cheapest way to find out, and until someone runs it this flow is unproven —
 * which is stated in the connector rather than left for a reader to discover.
 *
 * THE ASSERTION IS TAKEN, NOT GENERATED, and that is a deliberate limit. Signing
 * one means XMLDSig — canonicalisation, digest, signature — and a subtly wrong
 * signature fails only against a live tenant. Shipping unverifiable cryptography
 * into an auth path is worse than accepting a credential the customer already
 * has from their IdP or SAP's own generator.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => stripSource(readFileSync(resolve(ROOT, p), "utf8"), "comments");

const RESOLVER = read("src/lib/sap-public/connection-resolver.ts");
const CONNECTOR = read("src/lib/sap-public/tdd-connector.ts");
const EXCHANGE = read("src/lib/sap-public/oauth-saml-bearer.ts");
const ROUTE = read("src/app/api/studio/connections/route.ts");
const FORM = read("src/components/studio/ConnectionsClient.tsx");
const CRYPTO = read("src/lib/sap-public/connection-crypto.ts");
const ENV_EXAMPLE = readFileSync(resolve(ROOT, ".env.example"), "utf8");

/**
 * The function BODY, not the first mention of its name.
 *
 * indexOf("fetchSamlBearerToken") finds the CALL SITE in
 * buildAuthHeaderFromConnection, so a slice taken from there covers the wrong
 * code entirely — which is how the cache assertion below first failed against a
 * function that does use the cache.
 */
const SAML_FLOW = RESOLVER.slice(RESOLVER.indexOf("async function fetchSamlBearerToken"));
const ENV_SAML_FLOW = CONNECTOR.slice(CONNECTOR.indexOf("async function fetchSamlBearerTokenFromEnv"));
const EXCHANGE_FLOW = EXCHANGE.slice(EXCHANGE.indexOf("export async function exchangeSamlBearerAssertion"));

describe("the five enumerations of auth type agree", () => {
  /*
   * ONE CONCEPT, FIVE COPIES. The auth type is declared in the resolver's union,
   * the env connector's union, the route's zod enum, the form's useState generic
   * and the form's <select>. Adding SAML bearer required editing all of them,
   * and nothing would have failed if one had been missed — the connection would
   * simply have been unselectable, or accepted by the API and rejected by the
   * form, depending on which.
   *
   * The env connector is the copy that WAS missed: for a release the stored
   * connection path accepted `oauth-saml-bearer` while `SF_TDD_AUTH_TYPE` still
   * refused it, so the deployment's own SuccessFactors tenant — what
   * /sap-explorer runs on — had no way off Basic before SAP removes it.
   *
   * This is the shape that produced the two-registry defect and the five routes
   * that knew one registry. A list repeated is a list that drifts.
   */
  const EXPECTED = ["basic", "bearer", "oauth-client-credentials", "oauth-saml-bearer"];

  it.each(EXPECTED)("%s is in the resolver union", (t) => {
    expect(RESOLVER).toContain(`"${t}"`);
  });

  it.each(EXPECTED)("%s is accepted by the env connector", (t) => {
    const fn = CONNECTOR.slice(CONNECTOR.indexOf("function getAuthType("));
    expect(fn.slice(0, 500)).toContain(`"${t}"`);
  });

  it.each(EXPECTED)("%s is accepted by the API schema", (t) => {
    const enumLine = ROUTE.slice(ROUTE.indexOf("authType: z.enum("));
    expect(enumLine.slice(0, 200)).toContain(`"${t}"`);
  });

  it.each(EXPECTED)("%s is offered by the form", (t) => {
    expect(FORM).toContain(`value="${t}"`);
  });
});

describe("SAML bearer is wired as its own flow, not a variant of client-credentials", () => {
  it("uses the saml2-bearer grant type", () => {
    expect(EXCHANGE).toContain("urn:ietf:params:oauth:grant-type:saml2-bearer");
  });

  it("sends company_id, which the SuccessFactors token endpoint requires", () => {
    expect(EXCHANGE).toContain("company_id");
  });

  it("does NOT send a Basic Authorization header on the token request", () => {
    // The assertion is the credential. Sending Basic as well would put a second,
    // weaker credential on the same request.
    const body = EXCHANGE_FLOW.slice(0, EXCHANGE_FLOW.indexOf("finally"));
    expect(body).not.toContain("Basic ");
    expect(body).not.toContain("Authorization");
  });

  it("is ONE exchange, called from both credential sources", () => {
    /*
     * The request shape is from SAP's documentation and unverified against a
     * live tenant. Two copies of it would be two places for the first live test
     * to find a difference; the stored-connection path and the env path must
     * send the same bytes.
     */
    expect(SAML_FLOW.slice(0, 900)).toContain("exchangeSamlBearerAssertion(");
    expect(ENV_SAML_FLOW.slice(0, 900)).toContain("exchangeSamlBearerAssertion(");
  });

  it("shares the token cache, so a call does not exchange twice per request", () => {
    expect(SAML_FLOW.slice(0, 600)).toContain("oauthTokenCache");
    expect(ENV_SAML_FLOW.slice(0, 600)).toContain("envSamlTokenCache");
  });
});

describe("the env tenant can be configured for it", () => {
  it("reads COMPANY_ID and SAML_ASSERTION from the prefix, by their own names", () => {
    for (const v of ["OAUTH_TOKEN_URL", "CLIENT_ID", "COMPANY_ID", "SAML_ASSERTION"]) {
      expect(ENV_SAML_FLOW.slice(0, 1200)).toContain(`requiredEnv(prefix, "${v}")`);
    }
  });

  it(".env.example documents the SuccessFactors variables and the removal date", () => {
    for (const v of ["SF_TDD_COMPANY_ID", "SF_TDD_SAML_ASSERTION", "SF_TDD_OAUTH_TOKEN_URL"]) {
      expect(ENV_EXAMPLE).toContain(v);
    }
    expect(ENV_EXAMPLE).toContain("20 NOVEMBER 2026");
    // The documented default must be the flow that survives the removal date.
    expect(ENV_EXAMPLE).toMatch(/SF_TDD_AUTH_TYPE="oauth-saml-bearer"/);
  });
});

describe("it fails legibly, and never leaks the assertion", () => {
  it("names each missing field rather than saying 'oauth is misconfigured'", () => {
    const validator = EXCHANGE.slice(EXCHANGE.indexOf("export function missingSamlBearerFields"));
    for (const field of ["oauthTokenUrl", "clientId", "companyId", "samlAssertion"]) {
      expect(validator.slice(0, 600), `${field} must be named when missing`).toContain(field);
    }
  });

  it("never puts the assertion into an error message", () => {
    /*
     * A failed exchange is exactly when someone pastes the error into a ticket.
     * The assertion is a signed credential; echoing it there would put it in an
     * issue tracker, which is how the SAP password in this project's own history
     * ended up somewhere it should not have been.
     */
    const errors = [
      ...(EXCHANGE_FLOW.match(/throw new Error\([\s\S]*?\);/g) ?? []),
      ...(SAML_FLOW.match(/throw new Error\([\s\S]*?\);/g) ?? []),
      ...(ENV_SAML_FLOW.match(/throw new Error\([\s\S]*?\);/g) ?? []),
    ];
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e, "an error interpolates the assertion").not.toMatch(/\$\{[^}]*[sS]amlAssertion/);
      expect(e, "an error interpolates the secrets bundle").not.toMatch(/\$\{[^}]*secrets\b/);
    }
  });
});

describe("the assertion is sealed like any other credential", () => {
  it("lives in the encrypted secrets bundle, not on the row", () => {
    expect(CRYPTO).toContain("samlAssertion");
    expect(CRYPTO).toContain("companyId");
  });

  it("is not in the connections projection, which must never return a secret", () => {
    const select = ROUTE.slice(ROUTE.indexOf("select: {"), ROUTE.indexOf("orderBy"));
    expect(select).not.toContain("samlAssertion");
    expect(select).not.toContain("secretsCiphertext");
  });

  it("accepts a realistically long assertion", () => {
    // Assertions are multi-kilobyte base64 XML. The 500-character ceiling used
    // for passwords would reject every real one, and the failure would look like
    // a validation quibble rather than a size limit.
    const line = ROUTE.slice(ROUTE.indexOf("samlAssertion: z.string()"));
    expect(line.slice(0, 80)).toMatch(/max\((\d{5,})\)/);
  });
});
