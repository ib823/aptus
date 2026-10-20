/**
 * The customer's OWN OData service path — what it may be, and nothing more.
 *
 * WHY THIS EXISTS. The broker could only call a service it resolved from a
 * product's curated list or an SAP-published catalogue row. A service the
 * customer built — a Z* RAP service, a YY1_* key-user CDS view, an ECC Gateway
 * service, SuccessFactors' /odata/v2 with custom MDF objects under it — is in
 * neither, so an interface for one saved and then answered 400 on every call.
 * An interface may now carry its own service root; this module decides whether
 * a string is one.
 *
 * A PATH ON THE CONNECTION'S OWN HOST, NEVER AN ADDRESS. The value is joined
 * verbatim onto the connection's baseUrl (sap-url.ts) and the connection's
 * credentials travel with the request, so anything that could move the request
 * to another host, or out of the service root, is refused here — before it is
 * stored, not when it is used:
 *
 *   - a scheme (`https:`, `javascript:`) or a leading `//` (a host);
 *   - `?` and `#` — CoreEdge places `sap-client` itself, after the full path,
 *     and nothing may be pre-placed in front of it;
 *   - backslashes, whitespace and control characters, which URL parsers and
 *     proxies disagree about;
 *   - `.` and `..` segments, empty segments, and every percent-escape that
 *     decodes to a separator, a dot, a `%` (double encoding) or a control
 *     character — `%2e%2e`, `%2f`, `%5c`, `%3f`, `%23`, `%252e`, `%00`;
 *   - anything outside a conservative character set: letters, digits and
 *     `/ _ - . ; = , ( ) ' ~ $`. Matrix parameters (`;v=0002`, `;o=ALIAS`)
 *     are SAP Gateway's own and stay allowed.
 *
 * And a final backstop: the path is resolved against a dummy origin by the
 * WHATWG parser, and refused unless the parser agrees it is exactly that path
 * on that origin. The origin guard in sap-url.ts stays behind all of this.
 *
 * CLIENT-SAFE. No server imports, so the Studio form validates with the same
 * function the API enforces with — one rule, one answer.
 */

export const MAX_SERVICE_PATH_LENGTH = 180;

/**
 * A custom interface's `externalId` is DERIVED: `custom:<path>`. Grants match on
 * externalId, so a grant a second person approved for one path can never
 * silently authorise another — a new path is a new id and needs a new grant.
 * Catalogue ids never contain `:` or `/`, so the two cannot collide.
 */
export const CUSTOM_EXTERNAL_ID_PREFIX = "custom:";

export const ODATA_VERSIONS = ["V2", "V4"] as const;
export type ODataVersion = (typeof ODATA_VERSIONS)[number];

export function isODataVersion(v: unknown): v is ODataVersion {
  return v === "V2" || v === "V4";
}

export type ServicePathRefusal =
  | "EMPTY"
  | "TOO_LONG"
  | "WHITESPACE_OR_CONTROL"
  | "BACKSLASH"
  | "QUERY_OR_FRAGMENT"
  | "SCHEME"
  | "NOT_ABSOLUTE"
  | "HOST"
  | "DISALLOWED_CHARACTER"
  | "BAD_ESCAPE"
  | "ENCODED_FORBIDDEN"
  | "EMPTY_SEGMENT"
  | "DOT_SEGMENT"
  | "SYSTEM_RESOURCE"
  | "NOT_NORMALIZED";

export type ServicePathCheck =
  /** `path` is normalized: one trailing "/" removed. */
  | { ok: true; path: string }
  | { ok: false; reason: ServicePathRefusal; message: string };

/** Plain language, one sentence or two, for people who are not SAP experts. */
export const SERVICE_PATH_MESSAGES: Record<ServicePathRefusal, string> = {
  EMPTY: "Enter the service path, starting with /. For example /sap/opu/odata/sap/ZUI_TRAVEL_O2.",
  TOO_LONG: `The service path is longer than ${MAX_SERVICE_PATH_LENGTH} characters. Enter only the service root, not a dataset or a query.`,
  WHITESPACE_OR_CONTROL:
    "The service path contains a space or an invisible character. Copy it again from the service binding, without spaces.",
  BACKSLASH: "Use forward slashes (/) in the service path, not backslashes (\\).",
  QUERY_OR_FRAGMENT: "Leave out everything from ? or # onwards. CoreEdge adds sap-client itself.",
  SCHEME:
    "Enter only the path, not a full address. For https://my-host/sap/opu/odata/sap/ZUI_TRAVEL_O2 enter /sap/opu/odata/sap/ZUI_TRAVEL_O2. The host always comes from the connection.",
  NOT_ABSOLUTE: "The service path must start with /. For example /sap/opu/odata/sap/ZUI_TRAVEL_O2.",
  HOST: "Enter only the path after the host, starting with a single /. The host always comes from the connection.",
  DISALLOWED_CHARACTER:
    "The service path contains a character a service path cannot have. Use letters, digits and / _ - . ; = , ( ) ' ~ $ only.",
  BAD_ESCAPE: "The service path has a % that is not followed by two hexadecimal digits.",
  ENCODED_FORBIDDEN:
    "The service path hides a slash, a dot, a % or another separator behind a %-escape. Enter the path as plain text.",
  EMPTY_SEGMENT: "The service path has an empty part (// or a lone /). Remove the extra slash.",
  DOT_SEGMENT: "The service path cannot contain . or .. as a part of the path.",
  SYSTEM_RESOURCE:
    "Enter the service root, without $metadata or any other $ resource. For example /sap/opu/odata/sap/ZUI_TRAVEL_O2.",
  NOT_NORMALIZED: "The service path does not read the same once it is parsed as a URL path. Enter it as plain text.",
};

const WHITESPACE_OR_CONTROL = /[\u0000-\u001F\u007F\s\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const CHARSET = /^[A-Za-z0-9/_\-.;=,()'~$%]+$/;
const HEX2 = /^[0-9A-Fa-f]{2}$/;
/** What a %-escape may decode to: never a separator, a dot, a % or a control. */
const ESCAPABLE = /^[A-Za-z0-9_\-;=,()'~$]$/;
const BACKSTOP_ORIGIN = "https://service-path.invalid";

function refuse(reason: ServicePathRefusal): ServicePathCheck {
  return { ok: false, reason, message: SERVICE_PATH_MESSAGES[reason] };
}

/**
 * Is `raw` a service root this broker may call on a connection's host?
 *
 * The input is never trimmed: a stored value must be exactly what was checked.
 * The UI trims before it sends.
 */
export function validateServicePath(raw: unknown): ServicePathCheck {
  if (typeof raw !== "string" || raw.length === 0) return refuse("EMPTY");
  if (raw.length > MAX_SERVICE_PATH_LENGTH) return refuse("TOO_LONG");
  if (WHITESPACE_OR_CONTROL.test(raw)) return refuse("WHITESPACE_OR_CONTROL");
  if (raw.includes("\\")) return refuse("BACKSLASH");
  if (raw.includes("?") || raw.includes("#")) return refuse("QUERY_OR_FRAGMENT");
  if (SCHEME.test(raw)) return refuse("SCHEME");
  if (!raw.startsWith("/")) return refuse("NOT_ABSOLUTE");
  if (raw.startsWith("//")) return refuse("HOST");

  // One trailing slash is how ADT and /IWFND/MAINT_SERVICE often print a
  // service root; `/x/` and `/x` are the same service and the same identity.
  const path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;

  if (!CHARSET.test(path)) return refuse("DISALLOWED_CHARACTER");

  for (let i = path.indexOf("%"); i !== -1; i = path.indexOf("%", i + 1)) {
    const hex = path.slice(i + 1, i + 3);
    if (!HEX2.test(hex)) return refuse("BAD_ESCAPE");
    const decoded = String.fromCharCode(Number.parseInt(hex, 16));
    if (!ESCAPABLE.test(decoded)) return refuse("ENCODED_FORBIDDEN");
  }

  for (const segment of path.slice(1).split("/")) {
    if (segment === "") return refuse("EMPTY_SEGMENT");
    if (segment === "." || segment === "..") return refuse("DOT_SEGMENT");
    // Decoded, so `%24metadata` is refused like `$metadata`. Every escape
    // that survived the loop above decodes to an allowed character.
    if (decodeURIComponent(segment).startsWith("$")) return refuse("SYSTEM_RESOURCE");
  }

  let parsed: URL;
  try {
    parsed = new URL(path, BACKSTOP_ORIGIN);
  } catch {
    return refuse("NOT_NORMALIZED");
  }
  if (
    parsed.origin !== BACKSTOP_ORIGIN ||
    parsed.pathname !== path ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return refuse("NOT_NORMALIZED");
  }

  return { ok: true, path };
}

/** The derived grant identity of a custom interface. `path` must be validated. */
export function customExternalId(path: string): string {
  return `${CUSTOM_EXTERNAL_ID_PREFIX}${path}`;
}

export function isCustomExternalId(id: string): boolean {
  return id.startsWith(CUSTOM_EXTERNAL_ID_PREFIX);
}

/**
 * A UI hint only: SAP's V4 roots live under /odata4/ (RAP) or /odatav4/.
 * Never decides runtime — the interface's declared version does, and Verify
 * checks it against what the service says about itself.
 */
export function inferODataVersion(path: string): ODataVersion {
  return /\/odata(?:v)?4\//i.test(`${path}/`) ? "V4" : "V2";
}
