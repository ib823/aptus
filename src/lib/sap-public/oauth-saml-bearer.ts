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
 * is the sentence a screen may show; it never carries a URL, a host or markup.
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
 * The ONLY caught errors whose words may reach a client-visible detail.
 *
 * A caught error in general must never be repeated to a client: a fetch error
 * stringifies with the host, and on an OAuth path with the request. These
 * three are the exceptions because each is constructed to be shown —
 * SamlBearerExchangeError's `publicDetail` (SuccessFactors' sanitised refusal,
 * no URL), and the messages of SamlKeyError and SamlAssertionInputError (fixed
 * sentences, never key material or a field's value) — and each is the only
 * diagnostic a first SuccessFactors test gets. Anything else returns null, and
 * the caller keeps its generic sentence.
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
  if (err instanceof SamlKeyError || err instanceof SamlAssertionInputError) {
    return { status: "ERROR", httpStatus: null, detail: err.message };
  }
  return null;
}

/** The sealed identifiers SuccessFactors may echo, and what replaces each. */
export type SealedIdentifiers = Partial<Pick<SamlBearerCredentials, "clientId" | "companyId" | "samlUserId">>;

/** Shorter than this, a value is replaced only at the cost of mangling ordinary words. */
const MIN_REDACTED_LENGTH = 3;

/**
 * Bound SuccessFactors' errorMessage before it goes anywhere a person reads.
 *
 * In order: the sealed identifiers SuccessFactors echoes become placeholders
 * (longest first, so one inside another cannot leave half of it); whitespace
 * collapses; URLs and host names go, since the detail reaches people who are
 * not shown where a connection points; `<` and `>` go, so it cannot carry
 * markup into the alert email; and any base64-looking run over 40 characters
 * is replaced — except an upper-case, underscore-separated identifier such as
 * OAUTH2_ERROR_UNABLE_TO_VERIFY_SAML_ASSERTION, which is SuccessFactors naming
 * the failure, not a secret. 300 characters at most.
 */
export function sanitizeSuccessFactorsError(raw: unknown, sealed: SealedIdentifiers = {}): string | null {
  if (typeof raw !== "string") return null;
  const placeholders = new Map<string, string>();
  for (const [value, label] of [
    [sealed.clientId, "[API key]"],
    [sealed.companyId, "[company id]"],
    [sealed.samlUserId, "[user id]"],
  ] as const) {
    const v = value?.trim().toLowerCase() ?? "";
    if (v.length >= MIN_REDACTED_LENGTH && !placeholders.has(v)) placeholders.set(v, label);
  }
  // One pass, longest alternative first: a placeholder already written is
  // never searched again, and a value inside a longer one cannot split it.
  const alternatives = [...placeholders.keys()]
    .sort((a, b) => b.length - a.length)
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const text =
    alternatives.length > 0
      ? raw.replace(new RegExp(alternatives.join("|"), "gi"), (m) => placeholders.get(m.toLowerCase()) ?? "[…]")
      : raw;
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, "[link]")
    // Lower case only, as host names are written: "assertion.Please" — a
    // sentence missing its space — is SuccessFactors' words, not a host.
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/g, "[host]")
    .replace(/[<>]/g, "")
    .replace(/[A-Za-z0-9+/=_-]{41,}/g, (run) => (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(run) ? run : "[…]"))
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 300 ? `${cleaned.slice(0, 299)}…` : cleaned;
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
