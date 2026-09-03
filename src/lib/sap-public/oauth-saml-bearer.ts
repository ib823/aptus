/**
 * OAuth 2.0 SAML bearer assertion → access token. The SuccessFactors flow.
 *
 * ONE EXCHANGE, TWO CREDENTIAL SOURCES. SAP is removing HTTP Basic
 * authentication for SuccessFactors APIs on 20 November 2026; the replacement
 * this product expresses is the SAML bearer assertion grant. The stored
 * `SapConnection` path (connection-resolver) implemented it first. The
 * env-tenant path (tdd-connector, `{PREFIX}_*` variables — what /sap-explorer
 * runs on) still only knew basic | bearer | oauth-client-credentials, so the
 * deployment's own SuccessFactors tenant could not be moved off Basic at all.
 *
 * The exchange lives here so both callers send the SAME request. Two copies of
 * a token request whose shape is "from SAP's documentation, unverified against
 * a live tenant" would be two places for the first live test to find a
 * difference. Callers own their cache (keyed by connection id or env prefix)
 * because that is the only thing that differs between them.
 *
 * NO Prisma import, deliberately: tdd-connector is reachable from client
 * bundles through the product registry, and this module must stay inert there.
 */

export interface SamlBearerCredentials {
  /** The SF API key registered under Admin Center → Manage OAuth2 Client Applications. */
  clientId: string | null | undefined;
  /** The SuccessFactors company identifier the token endpoint requires. */
  companyId: string | null | undefined;
  /** A signed SAML assertion — taken from the IdP or SAP's generator, never signed here. */
  samlAssertion: string | null | undefined;
  /** e.g. https://apiNN.successfactors.com/oauth/token */
  tokenUrl: string | null | undefined;
}

export interface SamlBearerToken {
  accessToken: string;
  /** Milliseconds until expiry as the server reported it, or null when it did not say. */
  ttlMs: number | null;
}

/**
 * The fields a SAML bearer exchange cannot proceed without, by name.
 *
 * Named individually. "oauth is misconfigured" on a four-field flow is a
 * guessing game, and this one is being set up against a deadline.
 */
export function missingSamlBearerFields(c: SamlBearerCredentials): string[] {
  return [
    !c.tokenUrl && "oauthTokenUrl",
    !c.clientId && "clientId (the SuccessFactors API key)",
    !c.companyId && "companyId",
    !c.samlAssertion && "samlAssertion",
  ].filter((f): f is string => Boolean(f));
}

interface OAuthTokenResponse {
  access_token?: string;
  /** Seconds until expiry, per RFC 6749. Absent on some SAP token endpoints. */
  expires_in?: number;
}

/**
 * Exchange a signed SAML assertion for an access token.
 *
 * `label` is what an error names — a connection key or an env prefix — and is
 * the only thing about the caller that reaches an error message. The assertion
 * is never echoed: a failed exchange is exactly when someone pastes the error
 * into a ticket.
 */
export async function exchangeSamlBearerAssertion(
  c: SamlBearerCredentials,
  label: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs: number },
): Promise<SamlBearerToken> {
  const missing = missingSamlBearerFields(c);
  if (missing.length > 0) {
    throw new Error(`${label} is SAML bearer auth but missing ${missing.join(", ")}.`);
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetchImpl(c.tokenUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      // No Authorization header: the assertion IS the credential. Sending Basic
      // as well would be a second, weaker credential on the same request.
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:saml2-bearer",
        client_id: c.clientId!,
        company_id: c.companyId!,
        assertion: c.samlAssertion!,
      }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as OAuthTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      throw new Error(
        `SAML bearer token request failed for ${label}: HTTP ${res.status}. ` +
          "An expired or unregistered assertion is the usual cause.",
      );
    }
    const ttlMs =
      typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in * 1000 : null;
    return { accessToken: json.access_token, ttlMs };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SAML bearer token request for ${label} timed out after ${opts.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
