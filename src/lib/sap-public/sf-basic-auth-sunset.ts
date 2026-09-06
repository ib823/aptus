/**
 * 2608 WS8 — SuccessFactors stops accepting HTTP Basic on 20 November 2026.
 *
 * The replacement already exists: `oauth-saml-bearer.ts` implements the SAML
 * bearer assertion grant on both credential paths (a stored `SapConnection`
 * and an env-configured tenant). What did not exist was anything stopping a
 * deployment from staying on Basic until the day SAP turned it off and every
 * SuccessFactors call started failing at once, in production, with no warning
 * anyone had read.
 *
 * So this is a date, in one place, checked on the two paths that build an
 * Authorization header. Before the date a Basic SuccessFactors connection
 * warns, loudly and by name. On and after it, the call is refused here rather
 * than by SAP — because a refusal we raise says what to do about it, and a 401
 * from SAP does not.
 *
 * SCOPE. SuccessFactors only. Basic remains legitimate for other products, and
 * a guard that broke them to protect SuccessFactors would be a worse bug than
 * the one it prevents. Every entry point passes the product explicitly; there
 * is no inference from a hostname or a key.
 *
 * The date is SAP's, from the SuccessFactors API deprecation notice, and is
 * recorded in the 2608 assessment workbook's "Non-Public SAP" tab. It is not
 * configurable: an env var that postponed it would be a way to keep a broken
 * deployment quiet right up to the moment it broke.
 */

/** The day SAP withdraws HTTP Basic for SuccessFactors API access. */
export const SF_BASIC_AUTH_SUNSET_ISO = "2026-11-20" as const;

/** Product keys this guard applies to. SuccessFactors only, deliberately. */
const GUARDED_PRODUCTS = new Set(["successfactors", "sf", "successfactors-hcm"]);

export type BasicAuthVerdict =
  | { kind: "not-applicable" }
  | { kind: "allowed"; daysRemaining: number; warning: string }
  | { kind: "refused"; reason: string };

export function isGuardedSuccessFactorsProduct(product: string | null | undefined): boolean {
  return typeof product === "string" && GUARDED_PRODUCTS.has(product.trim().toLowerCase());
}

function sunsetDate(): Date {
  return new Date(`${SF_BASIC_AUTH_SUNSET_ISO}T00:00:00Z`);
}

/**
 * What to do about a Basic-auth SuccessFactors connection right now. Pure, so
 * the boundary date is testable without waiting for it.
 */
export function successFactorsBasicAuthVerdict(
  product: string | null | undefined,
  authType: string | null | undefined,
  now: Date = new Date(),
  label = "this connection",
): BasicAuthVerdict {
  if (!isGuardedSuccessFactorsProduct(product)) return { kind: "not-applicable" };
  if (authType !== "basic") return { kind: "not-applicable" };

  const sunset = sunsetDate();
  if (now.getTime() >= sunset.getTime()) {
    return {
      kind: "refused",
      reason:
        `SuccessFactors refuses HTTP Basic authentication from ${SF_BASIC_AUTH_SUNSET_ISO}; ` +
        `${label} is still configured for it. Switch it to oauth-saml-bearer — register an ` +
        `OAuth2 client under Admin Center → Manage OAuth2 Client Applications, then set the ` +
        `API key, company id, signed SAML assertion and token URL. Calling SAP with Basic ` +
        `after this date returns 401 and nothing here can make it work.`,
    };
  }
  const daysRemaining = Math.ceil((sunset.getTime() - now.getTime()) / 86_400_000);
  return {
    kind: "allowed",
    daysRemaining,
    warning:
      `${label} authenticates to SuccessFactors with HTTP Basic, which SAP withdraws on ` +
      `${SF_BASIC_AUTH_SUNSET_ISO} — ${daysRemaining} day(s) away. Move it to ` +
      `oauth-saml-bearer before then; after that date this call is refused.`,
  };
}

/**
 * Throw when a SuccessFactors connection would use Basic past the sunset, warn
 * while it still works. Call it where the Authorization header is built, so
 * there is no path that reaches SAP without passing it.
 */
export function assertSuccessFactorsBasicAuthAllowed(
  product: string | null | undefined,
  authType: string | null | undefined,
  label = "this connection",
  now: Date = new Date(),
): void {
  const verdict = successFactorsBasicAuthVerdict(product, authType, now, label);
  if (verdict.kind === "refused") throw new Error(verdict.reason);
  if (verdict.kind === "allowed") console.warn(`[sf-basic-auth-sunset] ${verdict.warning}`);
}
