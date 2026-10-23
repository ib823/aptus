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
 * "Allow writes" (P0.3): `writeEnabled` is sent only when ticked. The route
 * reads an absent `writeEnabled` as off — which, over a connection that
 * allowed writes, its response says. There is no connection write secret
 * (wave 2 integration review round 3): the form asked for one, sealed it, and
 * nothing ever read it back, so it gated nothing.
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
  /**
   * The Header name field is untouched on a re-save of an API-key connection
   * (wave 2 rotation probe review round 2). The header name is sealed with
   * the key, so the form cannot show it; while the field is blank the save
   * asks the route to keep the stored one (`keepStoredApiKeyHeader`) instead
   * of resetting it to `apikey`. Typing a name sends that name.
   */
  readonly keepStoredApiKeyHeader?: boolean;
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
 * The system a connection's writes land in: its environment, its base URL
 * (SAP host and base path) and its SAP client (P0.3 review rounds 2-3).
 * Writes are allowed for THAT system, not for the row id, so a save that
 * keeps writes on while pointing the row at another system switches writes on
 * there for the first time.
 */
export interface ConnectionWriteTarget {
  readonly environment: string | null;
  readonly baseUrl: string;
  readonly client: string | null;
}

export type WriteTargetField = "environment" | "baseUrl" | "client";

/**
 * The system a base URL addresses: its origin and its path, without a
 * trailing slash, a query or a fragment — or the trimmed text when it is not
 * a URL.
 *
 * THE PATH IS PART OF THE SYSTEM (P0.3 review round 3). Every request is the
 * base URL with the service path joined on (sap-url.ts `buildSapUrl`), so
 * behind one API-management or other path-routed gateway host,
 * `https://apim…/s4-dev` and `https://apim…/s4-prod` are two SAP systems.
 * Compared by origin alone, moving a writing connection from one to the other
 * was a plain secret save. The probe path is `apiPath`, a separate field, so
 * a base path that changes always addresses something else. The origin is
 * case-insensitive (the URL parser lower-cases the host); the path is not.
 */
function systemOf(baseUrl: string): string {
  try {
    const url = new URL(baseUrl.trim());
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Which parts of the write target differ between the row as stored and the
 * save — one rule, used by the route to decide whether a save that keeps
 * writes on is enabling them, and by the form to decide whether its "Allow
 * writes" box starts ticked. Environments compare in the vocabulary the route
 * stores ("dev" is DEV), base URLs by host and base path (`systemOf`: a
 * trailing slash is the same system, another gateway path is not), clients
 * as trimmed text with blank as none.
 *
 * Not compared: a system chosen inside the sealed credentials (a
 * SuccessFactors company ID, a basic-auth user@company). They are sealed and
 * not readable here; whether to compare them is an open decision in
 * docs/runbooks/coreedge-truthful-screens.md.
 */
export function writeTargetChanges(before: ConnectionWriteTarget, after: ConnectionWriteTarget): WriteTargetField[] {
  const changed: WriteTargetField[] = [];
  if (parseSapEnvironment(before.environment) !== parseSapEnvironment(after.environment)) changed.push("environment");
  if (systemOf(before.baseUrl) !== systemOf(after.baseUrl)) changed.push("baseUrl");
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
 * The non-secret settings a connection stores, as the Connections screen
 * loads them: everything the save route accepts that is not sealed. The
 * sealed ones (user, client id, company id, SAML user, API-key header, and
 * every secret) are never read back, so the form asks for them. The API-key
 * header is the one sealed setting a re-save keeps without it being typed:
 * the form leaves its field blank and the route keeps the stored name
 * (`ConnectionFormFields.keepStoredApiKeyHeader`).
 */
export interface StoredConnectionSettings {
  readonly label: string;
  readonly baseUrl: string;
  readonly authType: string;
  readonly environment: string | null;
  readonly client: string | null;
  readonly oauthTokenUrl?: string | null;
  readonly apiPath: string | null;
  readonly timeoutMs: number | null;
}

/** A stored setting the form shows and sends back (wave 2 final review round 3). */
export type StoredSetting =
  | "label"
  | "baseUrl"
  | "environment"
  | "client"
  | "authType"
  | "oauthTokenUrl"
  | "apiPath"
  | "timeoutMs";

export type StoredFormSettings = Pick<ConnectionFormFields, StoredSetting>;

const FORM_AUTH_TYPES: ReadonlySet<string> = new Set([
  "basic",
  "bearer",
  "oauth-client-credentials",
  "oauth-saml-bearer",
  "api-key",
]);

/**
 * What the form's fields hold for the connection a save replaces, until the
 * person edits them: its stored settings, as typed text (wave 2 final review
 * round 3). A form that started blank sent no probe path or timeout on a
 * re-save, and the route, which replaces every column with what is sent,
 * cleared them: a rotation silently changed where and how long the
 * connection is probed. A new connection (`row` null) starts blank.
 */
export function storedFormSettings(row: StoredConnectionSettings | null): StoredFormSettings {
  return {
    label: row?.label ?? "",
    baseUrl: row?.baseUrl ?? "",
    environment: row?.environment ?? "",
    client: row?.client ?? "",
    authType: row && FORM_AUTH_TYPES.has(row.authType) ? (row.authType as ConnectionFormFields["authType"]) : "basic",
    oauthTokenUrl: row?.oauthTokenUrl ?? "",
    apiPath: row?.apiPath ?? "",
    timeoutMs: row?.timeoutMs === null || row?.timeoutMs === undefined ? "" : String(row.timeoutMs),
  };
}

/** A connection as the form's twin check reads it: the binding tuple and whether it serves. */
export interface TwinCandidate {
  readonly product: string;
  readonly key: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly environment: string | null;
  readonly client: string | null;
}

/**
 * The active connection that now holds the stored environment of the
 * DEACTIVATED row a save replaces, or null (wave 2 rotation probe review
 * round 1). Saving a row makes it active, and the route refuses a save whose
 * environment an active row of the product and SAP client already has (its
 * twin rule, `findActiveTwin`). The form on main started blank and sent no
 * environment, so bringing back a retired row next to its live replacement
 * saved, with the environment cleared; a form that sends the stored
 * environment back would be refused instead. So, for that row only, the
 * form starts the Environment field blank, as main did, names the twin, and
 * says the stored environment is changed (`changedStoredSettings`).
 */
export function storedEnvironmentTwin<T extends TwinCandidate>(
  replacing: TwinCandidate | null,
  connections: readonly T[],
): T | null {
  if (!replacing || replacing.isActive) return null;
  const environment = parseSapEnvironment(replacing.environment);
  if (!environment) return null;
  const client = replacing.client?.trim() || null;
  return (
    connections.find(
      (c) =>
        c.isActive &&
        c.product === replacing.product &&
        c.key !== replacing.key &&
        parseSapEnvironment(c.environment) === environment &&
        (c.client?.trim() || null) === client,
    ) ?? null
  );
}

/** Each stored setting as `connectionSaveBody` sends it: null when it is not sent. */
function sentSettings(f: StoredFormSettings & Pick<ConnectionFormFields, "product">): Record<StoredSetting, string | null> {
  const oauth = f.authType === "oauth-client-credentials" || f.authType === "oauth-saml-bearer";
  const timeout = f.timeoutMs.trim() && Number.isFinite(Number(f.timeoutMs)) ? String(Number(f.timeoutMs)) : null;
  return {
    label: f.label.trim(),
    baseUrl: f.baseUrl.trim().replace(/\/+$/, ""),
    environment: f.environment.trim().toUpperCase() || null,
    client: PRODUCT_MARKS[f.product]?.addressesClient && f.client.trim() ? f.client.trim() : null,
    authType: f.authType,
    oauthTokenUrl: oauth && f.oauthTokenUrl.trim() ? f.oauthTokenUrl.trim() : null,
    apiPath: f.apiPath.trim() || null,
    timeoutMs: timeout,
  };
}

/**
 * Which stored settings a re-save changes: what the form will send against
 * what it loaded. The form names them before Save, so clearing the probe
 * path, or any other stored setting, is never silent.
 */
export function changedStoredSettings(
  stored: StoredFormSettings,
  form: StoredFormSettings & Pick<ConnectionFormFields, "product">,
): StoredSetting[] {
  const before = sentSettings({ ...stored, product: form.product });
  const after = sentSettings(form);
  return (Object.keys(after) as StoredSetting[]).filter((k) => before[k] !== after[k]);
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
      ? {
          apiKey: f.apiKey,
          // A typed header name is sent; a blank field on a re-save of an
          // API-key connection keeps the stored one, sealed and never shown.
          ...(f.apiKeyHeader.trim()
            ? { apiKeyHeader: f.apiKeyHeader.trim() }
            : f.keepStoredApiKeyHeader
              ? { keepStoredApiKeyHeader: true }
              : {}),
        }
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
     * Writes (P0.3): on only when ticked. Unticked sends nothing, which the
     * route reads as off; over a writing connection its response says so.
     */
    ...(f.allowWrites ? { writeEnabled: true } : {}),
    // What the form showed for the row it replaces (P0.3 review round 2).
    ...(rendered === undefined
      ? {}
      : { expected: rendered === null ? null : { isActive: rendered.isActive, writeEnabled: rendered.writeEnabled } }),
  };
}
