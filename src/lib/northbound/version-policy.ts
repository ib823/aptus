/**
 * Northbound API versions (roadmap P1.10): which exist, which a caller may
 * ask for, and what a response says about the one it was served.
 *
 * WHY DATED VERSIONS. The northbound routes were unversioned while three
 * roadmap items change what callers send or receive: P0.11 (key prefixes),
 * P1.4 (cursor paging) and P2.5 (OAuth). Without a version, the only way to
 * ship a breaking change was to break every deployed caller at once. Now:
 *
 *   - Every response states the version that served it (`CoreEdge-Version`).
 *   - A request MAY pin one with the same header. A request that does not is
 *     served the DEFAULT: the OLDEST version still supported. Unpinned callers
 *     (every caller built before this item, the starter kit, the ABAP
 *     samples) therefore keep today's behaviour until that version's Sunset
 *     date, and are told about it months ahead in Deprecation and Sunset
 *     headers on every response. Defaulting to the NEWEST would break every
 *     unpinned caller the day a breaking version shipped.
 *   - An unknown or retired version is a typed 400 (UNSUPPORTED_VERSION) that
 *     names the supported versions. Never a silent fallback: a caller that
 *     asked for a contract and got another would find out from its data.
 *   - A breaking change ships only as a NEW dated version. The one it
 *     replaces stays served for at least MINIMUM_OVERLAP_MONTHS after the new
 *     one is released and after its deprecation is announced
 *     (`checkRegistry` enforces both on the recorded dates, and a unit test
 *     runs it on the real registry), with `Deprecation` (RFC 9745) and
 *     `Sunset` (RFC 8594). The announcement date is `announcedOn`, recorded
 *     by hand: nothing CI can read says when a change deployed, so review
 *     checks it (an open decision in the roadmap, P1.10).
 *
 * The URL path is a separate, coarser axis: `/api/northbound/v1/*` and the
 * original `/api/northbound/*` are ONE implementation (versioned-route.ts) and
 * serve the same dated versions. See docs/coreedge/api-changelog.md.
 *
 * PURE AND EDGE-SAFE: no imports, no I/O. The edge middleware stamps its own
 * refusals from here, and the route wrapper resolves from here, so the two
 * cannot disagree about which versions exist.
 */

/** The request and response header that names a version. */
export const VERSION_HEADER = "CoreEdge-Version";

/** The original path, served as an alias of v1 for as long as v1 exists. */
export const UNVERSIONED_BASE_PATH = "/api/northbound";
/** The versioned path. Same handlers, same versions. */
export const V1_BASE_PATH = "/api/northbound/v1";
export type NorthboundBasePath = typeof UNVERSIONED_BASE_PATH | typeof V1_BASE_PATH;

/** Where the machine-readable changelog is served (versions/route.ts). */
export const CHANGELOG_PATH = `${UNVERSIONED_BASE_PATH}/versions`;

/**
 * The least time a replaced version stays served: after its successor is
 * released, and after its deprecation is announced. "At least 6 months" is
 * the roadmap's figure [estimate]; changing it is a product decision.
 */
export const MINIMUM_OVERLAP_MONTHS = 6;

export interface NorthboundApiVersion {
  /** `YYYY-MM`: the month the version was cut. */
  version: string;
  /** ISO date (`YYYY-MM-DD`, UTC) the version became available. */
  releasedOn: string;
  /**
   * ISO date the deprecation takes (or took) effect, or null. Announced from
   * the moment it is set here and deployed: RFC 9745 allows a future date.
   */
  deprecatedOn: string | null;
  /**
   * ISO date the deprecation was first published, or null: the day the change
   * that set deprecatedOn DEPLOYED, which is when callers first see
   * Deprecation and Sunset. Required with deprecatedOn. The notice the policy
   * promises is measured from this date as well as from deprecatedOn, because
   * deprecatedOn may lie in the past (RFC 9745 allows "deprecated since") and
   * then says nothing about how long callers have been told.
   */
  announcedOn: string | null;
  /** ISO date from which the version is refused, or null. Requires deprecatedOn. */
  sunsetOn: string | null;
  /** One line for the changelog. */
  summary: string;
  /** What a caller sees, one entry per change. */
  changes: readonly string[];
}

/**
 * Every version, oldest first. The human-readable copy is
 * docs/coreedge/api-changelog.md; a unit test fails when the two disagree.
 */
export const NORTHBOUND_API_VERSIONS: readonly NorthboundApiVersion[] = [
  {
    version: "2026-10",
    releasedOn: "2026-10-24",
    deprecatedOn: null,
    announcedOn: null,
    sunsetOn: null,
    summary:
      "The northbound API as it was served before versioning, named. Nothing a caller sends or receives changed, except the additions listed.",
    changes: [
      "Routes: GET /interfaces, GET /interfaces/{id}/schema, GET /interfaces/{id}/data?limit=N (1 to 100, default 10) and POST /interfaces/{id}/data/write (needs X-CoreEdge-Write-Key and Idempotency-Key).",
      "Served at /api/northbound/v1/* and, unchanged, at /api/northbound/*. Both paths are one implementation.",
      "Added: every response carries CoreEdge-Version. A request may pin a version with the same header; an unknown or retired version is refused with 400 UNSUPPORTED_VERSION, naming the supported versions.",
      "Added: GET /versions, this changelog as JSON. No credential needed.",
      "Credentials: keys minted from P0.11 start ce_live_ (PROD) or ce_test_; keys minted before start ce_ and keep working until they expire. The prefix is never read to authenticate.",
      "Rate limits are per credential (60 reads and 60 writes a minute) with an address backstop: 429 RATE_LIMITED or 429 RATE_LIMITED_ADDRESS, and 503 LIMITER_UNAVAILABLE when the limiter cannot be asked.",
      "A grant authorises the one interface it was approved for (P0.1).",
    ],
  },
];

/* ── dates ────────────────────────────────────────────────────────────── */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const VERSION_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Midnight UTC of an ISO date, or NaN when it is not a real calendar date. */
export function utcDay(iso: string): number {
  const m = DATE_RE.exec(iso);
  if (!m) return Number.NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Date.UTC rolls 2026-02-31 into March; a date that does not round-trip is not one.
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : Number.NaN;
}

/** `iso` plus `months` calendar months, at midnight UTC. */
export function addMonthsUtc(iso: string, months: number): number {
  const t = utcDay(iso);
  if (Number.isNaN(t)) return Number.NaN;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

/* ── the registry's rules ─────────────────────────────────────────────── */

/**
 * Every way a registry can break the policy, as sentences. Empty is valid.
 *
 * Checked by a unit test on the real registry, so a version cannot be
 * deprecated with less notice than the policy promises, or retired without
 * a successor to move to, without CI failing.
 */
export function checkRegistry(
  registry: readonly NorthboundApiVersion[],
  minimumOverlapMonths = MINIMUM_OVERLAP_MONTHS,
): string[] {
  const problems: string[] = [];
  if (registry.length === 0) problems.push("There must be at least one version.");
  registry.forEach((v, i) => {
    if (!VERSION_RE.test(v.version)) problems.push(`${v.version}: a version is named YYYY-MM.`);
    for (const [field, value] of [
      ["releasedOn", v.releasedOn],
      ["deprecatedOn", v.deprecatedOn],
      ["announcedOn", v.announcedOn],
      ["sunsetOn", v.sunsetOn],
    ] as const) {
      if (value !== null && Number.isNaN(utcDay(value))) problems.push(`${v.version}: ${field} ${value} is not a date.`);
    }
    if (!v.summary.trim()) problems.push(`${v.version}: a version needs a summary.`);
    const prev = registry[i - 1];
    if (prev && !(prev.version < v.version && utcDay(prev.releasedOn) < utcDay(v.releasedOn))) {
      problems.push(`${v.version}: versions are listed oldest first, each released after the one before.`);
    }
    if (v.sunsetOn !== null && v.deprecatedOn === null) {
      problems.push(`${v.version}: a sunset needs a deprecation announced first.`);
    }
    if (v.announcedOn !== null && v.deprecatedOn === null) {
      problems.push(`${v.version}: announcedOn dates a deprecation, and none is set.`);
    }
    if (v.deprecatedOn === null) return;
    if (v.announcedOn === null) {
      problems.push(`${v.version}: a deprecation needs announcedOn, the day callers are first told (the day it deploys).`);
    }
    const successor = registry[i + 1];
    if (!successor) {
      problems.push(`${v.version}: the newest version cannot be deprecated; there would be nothing to move to.`);
      return;
    }
    if (utcDay(v.deprecatedOn) < utcDay(successor.releasedOn)) {
      problems.push(`${v.version}: deprecated before ${successor.version}, its replacement, is released.`);
    }
    if (v.sunsetOn === null) return;
    if (utcDay(v.sunsetOn) < addMonthsUtc(v.deprecatedOn, minimumOverlapMonths)) {
      problems.push(
        `${v.version}: sunset ${v.sunsetOn} is less than ${minimumOverlapMonths} months after its deprecation (${v.deprecatedOn}).`,
      );
    }
    if (v.announcedOn !== null && utcDay(v.sunsetOn) < addMonthsUtc(v.announcedOn, minimumOverlapMonths)) {
      problems.push(
        `${v.version}: sunset ${v.sunsetOn} is less than ${minimumOverlapMonths} months after its deprecation was announced (${v.announcedOn}).`,
      );
    }
    if (utcDay(v.sunsetOn) < addMonthsUtc(successor.releasedOn, minimumOverlapMonths)) {
      problems.push(
        `${v.version}: sunset ${v.sunsetOn} overlaps ${successor.version} (released ${successor.releasedOn}) by less than ${minimumOverlapMonths} months.`,
      );
    }
  });
  return problems;
}

/* ── state, as of a moment ────────────────────────────────────────────── */

export type VersionStatus = "supported" | "deprecated" | "retired";

/** Retired from the first instant of its sunset day (UTC); deprecated once announced. */
export function versionStatus(v: NorthboundApiVersion, now: Date): VersionStatus {
  if (v.sunsetOn !== null && now.getTime() >= utcDay(v.sunsetOn)) return "retired";
  return v.deprecatedOn !== null ? "deprecated" : "supported";
}

/** The versions a request may be served, oldest first. */
export function supportedVersions(
  now: Date,
  registry: readonly NorthboundApiVersion[] = NORTHBOUND_API_VERSIONS,
): NorthboundApiVersion[] {
  return registry.filter((v) => versionStatus(v, now) !== "retired");
}

/**
 * What an unpinned request is served: the OLDEST supported version. See the
 * header for why it is not the newest. Null only if every version is retired,
 * which `checkRegistry` makes impossible for a valid registry (the newest
 * version can never be deprecated, so never retired).
 */
export function defaultVersion(
  now: Date,
  registry: readonly NorthboundApiVersion[] = NORTHBOUND_API_VERSIONS,
): NorthboundApiVersion | null {
  return supportedVersions(now, registry)[0] ?? null;
}

/* ── resolving a request ──────────────────────────────────────────────── */

export type VersionResolution =
  | { ok: true; version: NorthboundApiVersion; pinned: boolean }
  | {
      ok: false;
      /** The value the caller sent, cut to a length safe to echo. */
      requested: string;
      reason: "UNKNOWN" | "RETIRED";
      /** When it was retired, for RETIRED. */
      retiredOn: string | null;
      supported: string[];
    };

/** Longest requested value echoed back in a refusal. */
const MAX_ECHO = 64;

/**
 * The version a request is served, from its `CoreEdge-Version` header.
 *
 * Absent, or blank after trimming, is unpinned: some HTTP stacks (SM59
 * header lists among them) send an empty value for a field left unset, and
 * that is not a request for a version. Anything else must name a supported
 * version exactly. Several values (`2026-10, 2027-04`, as a proxy joins
 * repeated headers) name none, and are refused rather than guessed at.
 */
export function resolveRequestedVersion(
  headerValue: string | null | undefined,
  now: Date = new Date(),
  registry: readonly NorthboundApiVersion[] = NORTHBOUND_API_VERSIONS,
): VersionResolution {
  const requested = (headerValue ?? "").trim();
  const supported = supportedVersions(now, registry);
  if (requested === "") {
    const fallback = supported[0];
    if (fallback) return { ok: true, version: fallback, pinned: false };
    return { ok: false, requested: "", reason: "UNKNOWN", retiredOn: null, supported: [] };
  }
  const found = registry.find((v) => v.version === requested);
  if (found && versionStatus(found, now) !== "retired") return { ok: true, version: found, pinned: true };
  return {
    ok: false,
    requested: requested.slice(0, MAX_ECHO),
    reason: found ? "RETIRED" : "UNKNOWN",
    retiredOn: found?.sunsetOn ?? null,
    supported: supported.map((v) => v.version),
  };
}

/** The sentence a refused version gets. Names what IS supported, and the default. */
export function unsupportedVersionMessage(r: Extract<VersionResolution, { ok: false }>): string {
  const list = r.supported.length > 0 ? r.supported.join(", ") : "none";
  const what =
    r.reason === "RETIRED"
      ? `${VERSION_HEADER} ${JSON.stringify(r.requested)} was retired on ${r.retiredOn}.`
      : `${VERSION_HEADER} ${JSON.stringify(r.requested)} is not a version of this API.`;
  const fallback = r.supported[0]
    ? ` Send one of these, or omit the header to be served the default (${r.supported[0]}).`
    : "";
  return `${what} Supported versions: ${list}.${fallback} See ${CHANGELOG_PATH}.`;
}

/* ── what a response says ─────────────────────────────────────────────── */

/** RFC 9110 IMF-fixdate, which RFC 8594 uses for Sunset. */
function httpDate(t: number): string {
  return new Date(t).toUTCString();
}

/**
 * The headers a response served as `v` carries.
 *
 *   CoreEdge-Version  always.
 *   Deprecation       RFC 9745: `@<unix seconds>` of the deprecation date,
 *                     from the moment one is set (it may be in the future).
 *   Sunset            RFC 8594: the HTTP-date the version stops being served.
 *   Link              rel="deprecation" and rel="sunset" pointing at the
 *                     changelog, which says what to move to.
 */
export function versionResponseHeaders(v: NorthboundApiVersion): Record<string, string> {
  const headers: Record<string, string> = { [VERSION_HEADER]: v.version };
  const links: string[] = [];
  if (v.deprecatedOn !== null) {
    headers.Deprecation = `@${Math.floor(utcDay(v.deprecatedOn) / 1000)}`;
    links.push(`<${CHANGELOG_PATH}>; rel="deprecation"; type="application/json"`);
  }
  if (v.sunsetOn !== null) {
    headers.Sunset = httpDate(utcDay(v.sunsetOn));
    links.push(`<${CHANGELOG_PATH}>; rel="sunset"; type="application/json"`);
  }
  if (links.length > 0) headers.Link = links.join(", ");
  return headers;
}

/**
 * The version headers for a refusal the EDGE sends (middleware.ts) on a
 * northbound path: the ones the route would have stamped, or none when the
 * requested version would itself be refused — that answer is the route's,
 * once the caller is within its limits.
 */
export function edgeVersionHeaders(headerValue: string | null, now: Date = new Date()): Record<string, string> {
  const r = resolveRequestedVersion(headerValue, now);
  return r.ok ? versionResponseHeaders(r.version) : {};
}

/* ── paths ────────────────────────────────────────────────────────────── */

/** Is this path the northbound API, on either base path? Whole segments only. */
export function isNorthboundPath(pathname: string): boolean {
  return pathname === UNVERSIONED_BASE_PATH || pathname.startsWith(`${UNVERSIONED_BASE_PATH}/`);
}

/** Which base path a northbound request came in on. */
export function northboundBasePathOf(pathname: string): NorthboundBasePath {
  return pathname === V1_BASE_PATH || pathname.startsWith(`${V1_BASE_PATH}/`) ? V1_BASE_PATH : UNVERSIONED_BASE_PATH;
}
