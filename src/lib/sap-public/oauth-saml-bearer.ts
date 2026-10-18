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
import {
  buildSignedSamlAssertion,
  SamlAssertionInputError,
  SamlKeyError,
} from "@/lib/sap-public/saml-assertion";

export interface SamlBearerCredentials {
  /** The SF API key registered under Admin Center → Manage OAuth2 Client Applications. */
  clientId: string | null | undefined;
  /** The SuccessFactors company identifier the token endpoint requires. */
  companyId: string | null | undefined;
  /**
   * A PRE-SIGNED assertion from an IdP or SAP's offline generator. The
   * fallback: it expires (ten minutes by SAP's default) and then every exchange
   * fails until someone pastes another. Ignored when `samlPrivateKey` is set.
   */
  samlAssertion?: string | null | undefined;
  /**
   * The registration's RSA private key. When set, every exchange signs a fresh
   * assertion (saml-assertion.ts) — the durable configuration.
   */
  samlPrivateKey?: string | null | undefined;
  /** The SuccessFactors user a signed assertion is issued for. Required with the key. */
  samlUserId?: string | null | undefined;
  /** e.g. https://apiNN.successfactors.com/oauth/token */
  tokenUrl: string | null | undefined;
}

/** True when this configuration has CoreEdge sign each assertion. */
export function signsOwnAssertion(c: Pick<SamlBearerCredentials, "samlPrivateKey">): boolean {
  return Boolean(c.samlPrivateKey && c.samlPrivateKey.trim());
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
  const signing = signsOwnAssertion(c);
  // Whitespace is absent: a user id of " " passes a truthiness check and is
  // then refused by SuccessFactors as an unknown user.
  const blank = (v: string | null | undefined) => !v || !v.trim();
  return [
    blank(c.tokenUrl) && "oauthTokenUrl",
    blank(c.clientId) && "clientId (the SuccessFactors API key)",
    blank(c.companyId) && "companyId",
    // Either CoreEdge signs (key + the user it signs for) or a pre-signed
    // assertion is supplied. Naming the pair when neither is present says
    // which one to reach for.
    signing && blank(c.samlUserId) && "samlUserId (the SuccessFactors user the assertion is issued for)",
    !signing && blank(c.samlAssertion) && "samlPrivateKey + samlUserId (or a pre-signed samlAssertion)",
  ].filter((f): f is string => Boolean(f));
}

interface OAuthTokenResponse {
  access_token?: string;
  /** Seconds until expiry, per RFC 6749. Absent on some SAP token endpoints. */
  expires_in?: number;
  /** SuccessFactors' refusal: e.g. `Unable to validate "Recipient" in the SAML assertion`. */
  errorMessage?: unknown;
}

/**
 * SuccessFactors refused the exchange — with what it said, made safe to show.
 *
 * WHY SUCCESSFACTORS' OWN WORDS ARE KEPT. Its errorMessage names the failing
 * field — "Unable to verify the signature", `Unable to validate "Recipient"`,
 * "Login failed - invalid user" — and on the first exchange against a real
 * tenant that sentence is the only diagnostic there is. A generic "it failed"
 * would turn one configuration fix into a support ticket.
 *
 * WHY IT IS SAFE. It never contains the assertion or the key. SuccessFactors
 * does echo request values back (`API key "…" does not exist in company "…"`),
 * and the API key, company id and user id are sealed like every other
 * credential here, so each is replaced by a placeholder before the sentence is
 * kept. The rest is bounded by `sanitizeSuccessFactorsError`. `publicDetail`
 * is the sentence a screen may show: no markup, and no link or host name that a
 * pattern can tell from a word (that function names the one it cannot).
 */
export class SamlBearerExchangeError extends Error {
  readonly code = "SAML_BEARER_REJECTED";
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly publicDetail: string,
  ) {
    super(message);
    this.name = "SamlBearerExchangeError";
  }
}

/**
 * The connection lacks a field the exchange cannot proceed without.
 *
 * Its own class so the Test result can name the field: a plain Error is (rightly)
 * never repeated to a client, and "could not be established" for a blank
 * company id sends the administrator looking at the network. `publicDetail`
 * carries only field names, never a value or the caller's label.
 */
export class SamlBearerConfigError extends Error {
  readonly code = "SAML_BEARER_MISCONFIGURED";
  readonly publicDetail: string;
  constructor(label: string, readonly missing: string[]) {
    super(`${label} is SAML bearer auth but missing ${missing.join(", ")}.`);
    this.name = "SamlBearerConfigError";
    this.publicDetail = `This connection is missing ${missing.join(", ")}. Save it again with ${
      missing.length === 1 ? "that" : "those"
    } filled in.`;
  }
}

/**
 * The ONLY caught errors whose words may reach a client-visible detail.
 *
 * A caught error in general must never be repeated to a client: a fetch error
 * stringifies with the host, and on an OAuth path with the request. These
 * four are the exceptions because each is constructed to be shown —
 * SamlBearerExchangeError's `publicDetail` (SuccessFactors' sanitised refusal,
 * no URL), SamlBearerConfigError's `publicDetail` (field names only), and the
 * messages of SamlKeyError and SamlAssertionInputError (fixed sentences, never
 * key material or a field's value) — and each is the only diagnostic a first
 * SuccessFactors test gets. Anything else returns null, and the caller keeps
 * its generic sentence.
 */
export function publicSamlFailure(
  err: unknown,
): { status: "UNAUTHORIZED" | "ERROR"; httpStatus: number | null; detail: string } | null {
  if (err instanceof SamlBearerExchangeError) {
    return {
      status: err.httpStatus === 401 || err.httpStatus === 403 ? "UNAUTHORIZED" : "ERROR",
      httpStatus: err.httpStatus,
      detail: err.publicDetail,
    };
  }
  if (err instanceof SamlBearerConfigError) return { status: "ERROR", httpStatus: null, detail: err.publicDetail };
  if (err instanceof SamlKeyError || err instanceof SamlAssertionInputError) {
    return { status: "ERROR", httpStatus: null, detail: err.message };
  }
  return null;
}

/** The sealed identifiers SuccessFactors may echo, and what replaces each. */
export type SealedIdentifiers = Partial<Pick<SamlBearerCredentials, "clientId" | "companyId" | "samlUserId">>;

/** Shorter than this, a value is replaced only at the cost of hiding ordinary words. */
const MIN_REDACTED_LENGTH = 3;

/**
 * How much of a refusal is examined. Only the first 300 characters are ever
 * shown, and the token endpoint's answer is unbounded — a gzip reply of 61 KB
 * inflates to 64 MB. The patterns below backtrack, and even the linear passes
 * cost a tenth of a second per megabyte, so run over the whole answer a hostile
 * endpoint blocked the event loop for seconds to minutes: on the Test button,
 * every northbound call and the fleet-wide probe sweep. The raw text is cut to
 * READ_LIMIT before anything runs, then to SANITIZE_WINDOW once normalised.
 */
const SANITIZE_WINDOW = 1000;
const READ_LIMIT = SANITIZE_WINDOW * 8;

/** A letter, digit or underscore — what a sealed value must not touch to count as a whole word. */
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;

/** Regex-escape for a `u`-flag pattern, where only syntax characters may be escaped. */
const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Characters that render as nothing, and could split a link or a host so no pattern sees it. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

/**
 * What the refusal AND each sealed value go through, so an echo still matches
 * its value: invisible characters and `<` `>` removed — before the link and
 * host passes, so "https:<>//evil<>.example" cannot be rejoined after them —
 * and whitespace collapsed.
 */
const normalise = (v: string) => v.replace(INVISIBLE, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

/**
 * A dotted name, in any script: labels of letters, marks, digits and hyphens
 * joined by a full stop (or an ideographic or full-width one), ending in a
 * label of two or more letters. It may start after a "." or "_" that does not
 * itself follow a label (".evil.example", "See...evil.example"), never inside
 * a name or an identifier.
 */
const DOTTED_NAME =
  /(?<![\p{L}\p{M}\p{N}-])(?<![\p{L}\p{M}\p{N}][._])((?:[\p{L}\p{M}\p{N}-]+[.\u3002\uFF0E\uFF61])+)(\p{L}[\p{L}\p{M}]+)(?![\p{L}\p{M}\p{N}_-])/gu;

/** IPv4, including one that ends a sentence ("from 10.0.0.1."). */
const IPV4 = /(?<!\p{N}|\p{N}\.)\p{N}{1,3}(?:\.\p{N}{1,3}){3}(?!\p{N}|\.\p{N})/gu;

/** An IPv6 candidate; `isIpv6` decides, so a time such as 12:30:45 is kept. */
const IPV6_CANDIDATE = /(?<![\p{L}\p{N}:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\p{L}\p{N}:])/giu;
const isIpv6 = (m: string) =>
  (m.includes("::") || (m.match(/:/g) ?? []).length === 7) && (m.match(/[0-9a-f]/gi) ?? []).length >= 2;

/**
 * Bound SuccessFactors' errorMessage before it goes anywhere a person reads.
 *
 * In order:
 *   1. The raw text is cut to READ_LIMIT, normalised (see `normalise`), and
 *      cut again to SANITIZE_WINDOW at a word boundary, before any other
 *      pattern runs.
 *   2. The sealed API key, company id and user id become placeholders —
 *      matched as whole words, case-insensitively, from the values as stored
 *      and normalised the same way, in one pass with the longest first. Whole
 *      words, because a user id of "sam" must not turn SAML into
 *      "[user id]L"; from the stored values, because lower-casing İ or ẞ first
 *      produces a pattern that no longer matches the echo.
 *   3. Links go: anything with `://`, and `mailto:`.
 *   4. Host names and IP addresses (v4 and v6) go, since the detail reaches
 *      people who are not shown where a connection points. A dotted name
 *      counts as a host when its last label is all one case (or has no case),
 *      or when it has three labels or more — so "assertion.Please", a
 *      sentence missing its space, is kept. A two-label, mixed-case name
 *      ("Example-Host.Com") is indistinguishable from that and is kept too;
 *      the alert email is escaped at the sink, so it is never a live link
 *      there.
 *   5. Any base64-looking run over 40 characters is replaced — except an
 *      upper-case, underscore-separated identifier such as
 *      OAUTH2_ERROR_UNABLE_TO_VERIFY_SAML_ASSERTION, which is SuccessFactors
 *      naming the failure, not a secret.
 * 300 characters at most.
 */
export function sanitizeSuccessFactorsError(raw: unknown, sealed: SealedIdentifiers = {}): string | null {
  if (typeof raw !== "string") return null;
  const normalised = normalise(raw.slice(0, READ_LIMIT));
  let text = normalised;
  if (normalised.length > SANITIZE_WINDOW) {
    const cut = normalised.lastIndexOf(" ", SANITIZE_WINDOW);
    text = normalised.slice(0, cut > 0 ? cut : SANITIZE_WINDOW);
  }

  const values: { value: string; label: string }[] = [];
  for (const [value, label] of [
    [sealed.clientId, "[API key]"],
    [sealed.companyId, "[company id]"],
    [sealed.samlUserId, "[user id]"],
  ] as const) {
    const v = typeof value === "string" ? normalise(value) : "";
    if (v.length >= MIN_REDACTED_LENGTH) values.push({ value: v, label });
  }
  if (values.length > 0) {
    values.sort((a, b) => b.value.length - a.value.length);
    // One capture group per value, so the replacement knows which it matched
    // without a case-mapping lookup that İ and ẞ defeat.
    const alternatives = values.map((x) => `(${escapeRegExp(x.value)})`).join("|");
    const pattern = new RegExp(`(?<!${WORD_CHAR})(?:${alternatives})(?!${WORD_CHAR})`, "giu");
    text = text.replace(pattern, (...groups: unknown[]) => {
      const hit = groups.slice(1, values.length + 1).findIndex((g) => typeof g === "string");
      return values[hit]?.label ?? "[…]";
    });
  }

  const cleaned = text
    .replace(/\S*:\/\/\S*/g, "[link]")
    .replace(/(?<![\p{L}\p{N}_])mailto:\S*/giu, "[link]")
    .replace(IPV4, "[host]")
    .replace(IPV6_CANDIDATE, (m: string) => (isIpv6(m) ? "[host]" : m))
    .replace(DOTTED_NAME, (name: string, labels: string, last: string) => {
      const oneCase = last === last.toLowerCase() || last === last.toUpperCase();
      const threeOrMore = (labels.match(/[.\u3002\uFF0E\uFF61]/gu) ?? []).length >= 2;
      return oneCase || threeOrMore ? "[host]" : name;
    })
    .replace(/[A-Za-z0-9+/=_-]{41,}/g, (run) => (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(run) ? run : "[…]"))
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 300 ? `${cleaned.slice(0, 299)}…` : cleaned;
}

/**
 * The token URL exactly as fetch will send it: parsed, without a fragment
 * (never sent), and serialised — host lower-cased, a default port, dot
 * segments, backslashes, tabs, line breaks and invisible characters in the
 * host all resolved the way the request resolves them. It is also the
 * Recipient, which SuccessFactors compares with its own URL, so the two can
 * no longer differ. A value that does not parse is returned trimmed; the
 * request then fails on its own terms.
 */
function canonicalTokenUrl(v: string | null | undefined): string | null | undefined {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.href;
  } catch {
    return trimmed;
  }
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
  given: SamlBearerCredentials,
  label: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs: number },
): Promise<SamlBearerToken> {
  /*
   * NORMALISED ONCE, USED EVERYWHERE. A trailing newline from a hosting
   * dashboard is invisible, and fetch drops it from the URL while the signer
   * would have put it in the Recipient — a refusal that reads as a wrong token
   * URL when the URL looks right. Each value is trimmed here, and the token
   * URL is the one fetch will send (see canonicalTokenUrl), so the signed
   * assertion and the request carry the same values.
   */
  const trim = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : v);
  const c: SamlBearerCredentials = {
    ...given,
    tokenUrl: canonicalTokenUrl(given.tokenUrl),
    clientId: trim(given.clientId),
    companyId: trim(given.companyId),
    samlUserId: trim(given.samlUserId),
  };
  const missing = missingSamlBearerFields(c);
  if (missing.length > 0) throw new SamlBearerConfigError(label, missing);

  /*
   * A FRESH ASSERTION PER EXCHANGE when the key is held. Built before the
   * request so a key that cannot sign fails here, with SamlKeyError's own
   * sentence, rather than as an opaque 401 from SuccessFactors.
   */
  const assertion = signsOwnAssertion(c)
    ? buildSignedSamlAssertion({
        clientId: c.clientId!,
        userId: c.samlUserId!,
        tokenUrl: c.tokenUrl!,
        privateKey: c.samlPrivateKey!,
      })
    : c.samlAssertion!;

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
        assertion,
      }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as OAuthTokenResponse;
    if (!res.ok || typeof json.access_token !== "string") {
      const said = sanitizeSuccessFactorsError(json.errorMessage, c);
      const hint = signsOwnAssertion(c)
        ? "CoreEdge signed a fresh assertion, so the usual causes are a private key that does not match the " +
          "certificate registered for this API key, a user id SuccessFactors does not know, or a wrong company id."
        : "An expired or unregistered assertion is the usual cause.";
      const publicDetail = `SuccessFactors refused the token request (HTTP ${res.status})${said ? `: ${said}` : "."} ${hint}`;
      throw new SamlBearerExchangeError(
        `SAML bearer token request failed for ${label}: ${publicDetail}`,
        res.status,
        publicDetail,
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
