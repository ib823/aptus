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

import { parseSapEnvironment } from "@/lib/sap-public/environment";
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
 * What the form believed about the row it replaces when it rendered (P0.3
 * review round 2): its `isActive` and `writeEnabled`, or null when the form
 * believed the key was new. Sent as `expected`, so the route refuses a save
 * from a page loaded before someone else changed the row — a form opened
 * before an operator deactivated a writing connection would otherwise bring
 * it back, active, with its writes on.
 */
export interface RenderedConnectionState {
  readonly isActive: boolean;
  readonly writeEnabled: boolean;
}

/**
 * The system a connection's writes land in: its environment, its SAP host and
 * its SAP client (P0.3 review round 2). Writes are allowed for THAT system,
 * not for the row id, so a save that keeps writes on while pointing the row
 * at another system switches writes on there for the first time.
 */
export interface ConnectionWriteTarget {
  readonly environment: string | null;
  readonly baseUrl: string;
  readonly client: string | null;
}

export type WriteTargetField = "environment" | "baseUrl" | "client";

/** The host a base URL calls, or the trimmed text when it is not a URL. */
function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim()).origin.toLowerCase();
  } catch {
    return baseUrl.trim().toLowerCase();
  }
}

/**
 * Which parts of the write target differ between the row as stored and the
 * save — one rule, used by the route to decide whether a save that keeps
 * writes on is enabling them, and by the form to decide whether its "Allow
 * writes" box starts ticked. Environments compare in the vocabulary the route
 * stores ("dev" is DEV), hosts by origin (a probe path is not another
 * system), clients as trimmed text with blank as none.
 */
export function writeTargetChanges(before: ConnectionWriteTarget, after: ConnectionWriteTarget): WriteTargetField[] {
  const changed: WriteTargetField[] = [];
  if (parseSapEnvironment(before.environment) !== parseSapEnvironment(after.environment)) changed.push("environment");
  if (originOf(before.baseUrl) !== originOf(after.baseUrl)) changed.push("baseUrl");
  if ((before.client?.trim() || null) !== (after.client?.trim() || null)) changed.push("client");
  return changed;
}

/** The write target a form save points the row at: what `connectionSaveBody` sends. */
export function formWriteTarget(
  f: Pick<ConnectionFormFields, "product" | "environment" | "baseUrl" | "client">,
): ConnectionWriteTarget {
  return {
    environment: f.environment.trim() || null,
    baseUrl: f.baseUrl.trim(),
    client: PRODUCT_MARKS[f.product]?.addressesClient && f.client.trim() ? f.client.trim() : null,
  };
}

/**
 * The POST /api/studio/connections body the form sends — one function, so the
 * route-level test of a create reaching its first 201 (P0.3) sends exactly
 * what this screen sends, and nothing a screen does not offer.
 *
 * `rendered` is what the form showed for the row it replaces (null: a new
 * key). The form always passes it; leaving it out sends no `expected`, which
 * is what an API caller does.
 */
export function connectionSaveBody(
  f: ConnectionFormFields,
  rendered?: RenderedConnectionState | null,
): Record<string, unknown> {
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
    // What the form showed for the row it replaces (P0.3 review round 2).
    ...(rendered === undefined
      ? {}
      : { expected: rendered === null ? null : { isActive: rendered.isActive, writeEnabled: rendered.writeEnabled } }),
  };
}
