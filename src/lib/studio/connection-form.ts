/**
 * The Connections form's request body, as one pure function (P0.3).
 *
 * The form holds typed secrets; this module turns what it holds into the POST
 * /api/studio/connections body. It lives apart from the component so that
 * the route-level test of a create reaching its first 201
 * (tests/integration/create-from-screens.test.ts) sends exactly what the
 * screen sends, and so the component's own module keeps no secret-shaped
 * field (tests/unit/studio/connections-secret-safety.test.ts).
 *
 * "Allow writes" (P0.3): `writeEnabled` is sent, with the write secret, only
 * when ticked. The route refuses `writeEnabled` without a secret, and reads an
 * absent `writeEnabled` as off — which, over a connection that allowed
 * writes, its response says.
 */

import { PRODUCT_MARKS } from "@/lib/studio/product-marks";

/** Everything the connection form holds, as typed. */
export interface ConnectionFormFields {
  readonly product: string;
  readonly client: string;
  readonly key: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly environment: string;
  readonly authType: "basic" | "bearer" | "oauth-client-credentials" | "oauth-saml-bearer" | "api-key";
  readonly apiKey: string;
  readonly apiKeyHeader: string;
  readonly username: string;
  readonly password: string;
  readonly bearerToken: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly oauthTokenUrl: string;
  readonly companyId: string;
  readonly samlAssertion: string;
  readonly samlSigning: "key" | "assertion";
  readonly samlPrivateKey: string;
  readonly samlUserId: string;
  readonly apiPath: string;
  readonly timeoutMs: string;
  /** "Allow writes" (P0.3). */
  readonly allowWrites: boolean;
  /** Sealed with the rest of the bundle; required when writes are allowed. */
  readonly writeSecret: string;
}

/**
 * The POST /api/studio/connections body the form sends — one function, so the
 * route-level test of a create reaching its first 201 (P0.3) sends exactly
 * what this screen sends, and nothing a screen does not offer.
 */
export function connectionSaveBody(f: ConnectionFormFields): Record<string, unknown> {
  return {
    product: f.product,
    key: f.key.trim(),
    label: f.label.trim(),
    baseUrl: f.baseUrl.trim(),
    authType: f.authType,
    ...(f.environment.trim() ? { environment: f.environment.trim() } : {}),
    /*
     * Sent only where the product HAS a client. The API rejects one on a
     * cloud product, so a stale value left behind by switching the picker
     * from on-premise back to Cloud ERP would otherwise fail the whole
     * save with a message about a field the form is no longer showing.
     */
    ...(PRODUCT_MARKS[f.product]?.addressesClient && f.client.trim() ? { client: f.client.trim() } : {}),
    ...(f.apiPath.trim() ? { apiPath: f.apiPath.trim() } : {}),
    ...(f.timeoutMs.trim() && Number.isFinite(Number(f.timeoutMs)) ? { timeoutMs: Number(f.timeoutMs) } : {}),
    ...(f.authType === "basic" ? { username: f.username.trim(), password: f.password } : {}),
    ...(f.authType === "bearer" ? { bearerToken: f.bearerToken } : {}),
    ...(f.authType === "api-key"
      ? { apiKey: f.apiKey, ...(f.apiKeyHeader.trim() ? { apiKeyHeader: f.apiKeyHeader.trim() } : {}) }
      : {}),
    ...(f.authType === "oauth-saml-bearer"
      ? {
          clientId: f.clientId.trim(),
          companyId: f.companyId.trim(),
          oauthTokenUrl: f.oauthTokenUrl.trim(),
          // One credential source or the other, never both: the route
          // prefers the key, and sending a stale assertion alongside it
          // would seal a second credential nobody meant to keep.
          ...(f.samlSigning === "key"
            ? { samlPrivateKey: f.samlPrivateKey.trim(), samlUserId: f.samlUserId.trim() }
            : { samlAssertion: f.samlAssertion.trim() }),
        }
      : {}),
    ...(f.authType === "oauth-client-credentials"
      ? { clientId: f.clientId.trim(), clientSecret: f.clientSecret, oauthTokenUrl: f.oauthTokenUrl.trim() }
      : {}),
    /*
     * Writes (P0.3): on only when ticked, and always with the secret — the
     * route refuses writeEnabled without one. Unticked sends nothing, which the
     * route reads as off; over a writing connection its response says so.
     */
    ...(f.allowWrites ? { writeEnabled: true, writeSecret: f.writeSecret } : {}),
  };
}
