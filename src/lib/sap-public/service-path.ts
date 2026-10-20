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
 *     decodes to a separator, a dot, a `;`, a `%` (double encoding) or a
 *     control character — `%2e%2e`, `%2f`, `%5c`, `%3f`, `%23`, `%3b`,
 *     `%252e`, `%00`. Every other escape is decoded and the path stored as
 *     plain text, so one service has one spelling and one grant identity
 *     (review round 4). A segment is judged by its part BEFORE any `;`:
 *     servlet containers and many proxies strip `;params` before they
 *     normalise, so `..;` and `..;x=1` are `..` to them, and `;` alone is an
 *     empty segment;
 *   - anything outside a conservative character set: letters, digits and
 *     `/ _ - . ; = , ( ) ' ~ $`;
 *   - SAP ROUTING. The connection and its environment binding decide which
 *     SAP system and client answer, and every governance check (the grant's
 *     environment, the audit row, the write gate) reads that binding. Two SAP
 *     URL features would let a typed path overrule it behind the connection's
 *     host, where no origin check can see: Gateway matrix parameters
 *     (`;o=<system alias>`, `;mo`, `;c=`, `;sap-client=`) route a hub to
 *     another backend or client, and ICF URL mangling (`/sap(bD1lbiZjPTIwMA==)/`,
 *     a session segment carrying client and language) picks another client.
 *     So the ONLY matrix parameter allowed is a service version, `;v=` and
 *     one to four digits, on the last segment (`/sap/opu/odata/sap/ZX_SRV;v=0002`),
 *     and `(` / `)` are refused in the first two segments, where ICF reads
 *     its session segment. The short form Gateway examples and Fiori
 *     manifests print (`;v=2`) is the same version, so it is accepted and
 *     normalized to four digits — one service, one grant identity (review
 *     round 3).
 *   - ANYTHING THAT IS NOT AN ODATA SERVICE ROOT. The path must sit under
 *     one of the OData handlers SAP systems publish (ODATA_SERVICE_ROOTS):
 *     Gateway's /sap/opu/odata/ and /sap/opu/odata4/, SuccessFactors'
 *     /odata/v2 and /odatav4/. Reads of a custom service are not gated on a
 *     $metadata verification, so without this a path such as
 *     /sap/bc/adt/…, /sap/bc/soap/rfc or /sap/bc/gui/sap/its/webgui — any
 *     ICF handler, called with the connection's credentials — would be
 *     served to an external client as "records" (review round 2). The
 *     feature is the customer's own OData service; this makes that the rule.
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
 * A custom interface's `externalId` is DERIVED: `custom:<path>`, the path in
 * its service form (customExternalId: case-folded on the Gateway roots).
 * Grants match on externalId, so a grant a second person approved for one
 * service can never silently authorise another — a new service is a new id
 * and needs a new grant, and another spelling of the same service is not one.
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
  | "ROUTING_PARAMETER"
  | "SESSION_SEGMENT"
  | "SYSTEM_RESOURCE"
  | "NOT_ODATA_ROOT"
  | "DATASET_IN_PATH"
  | "NOT_NORMALIZED";

export type ServicePathCheck =
  /** `path` is normalized: %-escapes decoded, one trailing "/" removed, a `;v=` version written with four digits. */
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
  DOT_SEGMENT: "The service path cannot contain . or .. as a part of the path, with or without ; after it.",
  ROUTING_PARAMETER:
    "The service path carries an SAP routing setting after a ; (such as ;o= for another system or ;c= for another client). The SAP system and client always come from the connection, so only a version suffix such as ;v=0002 at the end is allowed.",
  SESSION_SEGMENT:
    "The service path starts with an SAP session part in brackets, such as /sap(…)/, which can choose another SAP client. Enter the plain service path; the client always comes from the connection.",
  SYSTEM_RESOURCE:
    "Enter the service root, without $metadata or any other $ resource. For example /sap/opu/odata/sap/ZUI_TRAVEL_O2.",
  NOT_ODATA_ROOT:
    "The service path must be an OData service: under /sap/opu/odata/ or /sap/opu/odata4/ on an SAP ERP or S/4HANA system (for example /sap/opu/odata/sap/ZUI_TRAVEL_O2), or /odata/v2 or under /odatav4/ on SuccessFactors.",
  DATASET_IN_PATH:
    "On SuccessFactors the service path is /odata/v2 itself. Enter /odata/v2 as the service path, and the last part (for example cust_TravelRequest) as the entity set.",
  NOT_NORMALIZED: "The service path does not read the same once it is parsed as a URL path. Enter it as plain text.",
};

/**
 * The OData handlers a custom service may live under. `prefix` roots need at
 * least one segment after them (the service); `exact` roots are a service
 * root themselves. Matched case-insensitively: ICF resolves its paths without
 * regard to case, so /SAP/OPU/ODATA/… reaches the same handler.
 */
export const ODATA_SERVICE_ROOTS: ReadonlyArray<{ root: string; kind: "prefix" | "exact" }> = [
  { root: "/sap/opu/odata", kind: "prefix" },
  { root: "/sap/opu/odata4", kind: "prefix" },
  { root: "/odata/v2", kind: "exact" },
  { root: "/odatav4", kind: "prefix" },
];

/**
 * SuccessFactors' V2 root is one service for the whole tenant, so the URL a
 * developer tested in Postman (`/odata/v2/cust_TravelRequest`) is that root
 * plus a dataset. Refused with a sentence that says where each part goes,
 * not the generic "must be an OData service" (review round 4).
 */
const SUCCESSFACTORS_V2_ROOT = "/odata/v2";

function isUnderODataRoot(path: string): boolean {
  const lower = path.toLowerCase();
  return ODATA_SERVICE_ROOTS.some(({ root, kind }) =>
    kind === "exact" ? lower === root : lower.startsWith(`${root}/`) && lower.length > root.length + 1,
  );
}

const WHITESPACE_OR_CONTROL = /[\u0000-\u001F\u007F\s\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const CHARSET = /^[A-Za-z0-9/_\-.;=,()'~$%]+$/;
const HEX2 = /^[0-9A-Fa-f]{2}$/;
/**
 * What a %-escape may decode to: never a separator, a dot, a `;` (a matrix
 * parameter in disguise), a % or a control.
 */
const ESCAPABLE = /^[A-Za-z0-9_\-=,()'~$]$/;
/** The one matrix parameter allowed: a Gateway service version, on the last segment. */
const VERSION_PARAMETER = /^v=(\d{1,4})$/;
/** The width Gateway prints a service version in, and the form stored. */
const VERSION_DIGITS = 4;
/** ICF reads its session (URL-mangling) segment here: /sap(…)/ or /<alias>/sap(…)/. */
const SESSION_SEGMENT_DEPTH = 2;
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
  let path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;

  if (!CHARSET.test(path)) return refuse("DISALLOWED_CHARACTER");

  for (let i = path.indexOf("%"); i !== -1; i = path.indexOf("%", i + 1)) {
    const hex = path.slice(i + 1, i + 3);
    if (!HEX2.test(hex)) return refuse("BAD_ESCAPE");
    const decoded = String.fromCharCode(Number.parseInt(hex, 16));
    if (!ESCAPABLE.test(decoded)) return refuse("ENCODED_FORBIDDEN");
  }

  // ONE SPELLING, ONE IDENTITY (review round 4). Every escape that survived
  // the loop above decodes to a character the path may carry as plain text,
  // and never to `/`, `;`, `.` or `%`, so decoding changes no segment
  // boundary. Storing the decoded form makes `%73ap` and `sap`, `%28` and `(`,
  // `;v=%30002` and `;v=0002` one path and one `custom:` id; without it the
  // same service had a grant identity per spelling. Everything below judges
  // the decoded path, so `%24metadata` is refused like `$metadata` and `%28`
  // like `(`.
  path = decodeURIComponent(path);

  const segments = path.slice(1).split("/");
  let version: string | null = null;
  for (const [index, decoded] of segments.entries()) {
    const semicolon = decoded.indexOf(";");
    // The segment as a servlet container or proxy sees it: params stripped.
    const base = semicolon === -1 ? decoded : decoded.slice(0, semicolon);
    if (base === "") return refuse("EMPTY_SEGMENT");
    if (base === "." || base === "..") return refuse("DOT_SEGMENT");
    if (semicolon !== -1) {
      const params = decoded.slice(semicolon + 1);
      const last = index === segments.length - 1;
      const match = last ? VERSION_PARAMETER.exec(params) : null;
      if (!match) return refuse("ROUTING_PARAMETER");
      version = match[1]!;
    }
    if (index < SESSION_SEGMENT_DEPTH && /[()]/.test(decoded)) return refuse("SESSION_SEGMENT");
    if (base.startsWith("$")) return refuse("SYSTEM_RESOURCE");
  }

  // `;v=2` and `;v=0002` are one version: store the four-digit form. Only the
  // last segment can carry a `;` (checked above), and the path is decoded, so
  // the parameter is already plain `v=` and digits.
  if (version !== null && version.length < VERSION_DIGITS) {
    path = `${path.slice(0, path.lastIndexOf(";"))};v=${version.padStart(VERSION_DIGITS, "0")}`;
    if (path.length > MAX_SERVICE_PATH_LENGTH) return refuse("TOO_LONG");
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

  // Last, so every structural refusal above keeps its own, more precise, reason.
  if (!isUnderODataRoot(path)) {
    return refuse(path.toLowerCase().startsWith(`${SUCCESSFACTORS_V2_ROOT}/`) ? "DATASET_IN_PATH" : "NOT_ODATA_ROOT");
  }

  return { ok: true, path };
}

/**
 * The Gateway roots (`/sap/opu/odata/`, `/sap/opu/odata4/`): ICF resolves its
 * nodes, and Gateway its namespaces and service names, without regard to
 * case, so every spelling of a path under them that differs only in case is
 * one service.
 */
const CASE_INSENSITIVE_PREFIXES = ["/sap/opu/odata/", "/sap/opu/odata4/"] as const;
/** Gateway's OData V2 root, where a service called without `;v=` is version 0001. */
const GATEWAY_V2_PREFIX = "/sap/opu/odata/";
const GATEWAY_DEFAULT_VERSION = `;v=${"1".padStart(VERSION_DIGITS, "0")}`;

/**
 * The form of a validated path that names its SERVICE: what the grant
 * identity is built from, never what is called (the stored path keeps the
 * developer's spelling for the wire).
 *
 * ONE SERVICE, ONE GRANT IDENTITY — ACROSS CASE (review round 5). Round 4
 * decoded escapes so `%73ap` and `sap` were one id, but `%53ap` decoded to
 * `Sap`, and `/SAP/OPU/ODATA/SAP/ZX_SRV` was accepted beside
 * `/sap/opu/odata/sap/ZX_SRV` — the validator matches its roots without
 * regard to case because ICF does. Each spelling was its own `custom:` id,
 * and grants match on the id exactly, so a write grant an approver denied or
 * revoked for one spelling could be requested afresh for another, with no
 * link to the earlier decision, and then write to the same SAP service.
 *
 *   - Under the Gateway roots, the whole path is folded to lower case.
 *   - On Gateway's V2 root, `;v=0001` is dropped: a Gateway V2 service called
 *     without a version is version 0001, so the two spellings are one service.
 *     Any other version stays and is its own service.
 *   - SuccessFactors' `/odata/v2` is an exact root and folds whole. Under
 *     `/odatav4/` only the root is folded: what follows is SuccessFactors'
 *     own routing, not known to ignore case, and folding two different
 *     services into one id would let one grant authorise both — the worse
 *     error of the two.
 */
function serviceIdentityPath(path: string): string {
  const lower = path.toLowerCase();
  if (CASE_INSENSITIVE_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return lower.startsWith(GATEWAY_V2_PREFIX) && lower.endsWith(GATEWAY_DEFAULT_VERSION)
      ? lower.slice(0, -GATEWAY_DEFAULT_VERSION.length)
      : lower;
  }
  for (const { root } of ODATA_SERVICE_ROOTS) {
    if (lower === root) return root;
    if (lower.startsWith(`${root}/`)) return `${root}${path.slice(root.length)}`;
  }
  return path;
}

/**
 * The derived grant identity of a custom interface: `custom:` and the path's
 * service form (serviceIdentityPath — case-folded on the Gateway roots).
 * `path` must be validated.
 */
export function customExternalId(path: string): string {
  return `${CUSTOM_EXTERNAL_ID_PREFIX}${serviceIdentityPath(path)}`;
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
