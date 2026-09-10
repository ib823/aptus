/**
 * SuccessFactors HTTP Basic — TWO dates, two behaviours.
 *
 * THE BUG THIS REPLACES. This module had one date, 2026-11-20, and threw on it.
 * That date is real, but it is SAP's RETIREMENT (deprecation) milestone: Basic
 * stops being supported and stops being available for new configurations. It is
 * not the day it stops working. SAP's own OAuth FAQ (KBA 3146449) puts the
 * "Deleted" date — when calls actually start failing — at 2027-11-12, and says
 * in the same breath that this is TENTATIVE and may move again. It has already
 * moved once.
 *
 * So the old guard would have refused every working Basic SuccessFactors
 * connection roughly a year before SAP did, in production, on a date the
 * customer had no reason to expect — and the refusal told them
 * "Calling SAP with Basic after this date returns 401 and nothing here can make
 * it work", which SAP's documentation contradicts. A guard against an outage
 * that causes the outage a year early is worse than no guard.
 *
 * The shape now matches the lifecycle:
 *
 *   before 2026-11-20        allowed     — warn, migration is coming
 *   2026-11-20 → deletion    deprecated  — warn HARDER; SAP still answers
 *   on/after deletion        refused     — Basic is gone; refuse with instructions
 *
 * WHY THE DELETION DATE IS OVERRIDABLE, WHEN THE OLD ONE DELIBERATELY WAS NOT.
 * The old comment argued that an env var "would be a way to keep a broken
 * deployment quiet right up to the moment it broke". That reasoning holds for a
 * CERTAIN date and inverts for a tentative one: hardcoding a hard refusal on a
 * date SAP says may move just recreates this same bug in November 2027. So the
 * deletion date tracks SAP through SF_BASIC_AUTH_DELETION_DATE, and the
 * deprecation warning is NOT suppressible — an operator can follow SAP's
 * schedule, but cannot switch off the reminder that migration is overdue.
 *
 * SCOPE. SuccessFactors only. Basic remains legitimate for other products, and a
 * guard that broke them to protect SuccessFactors would be a worse bug than the
 * one it prevents. Every entry point passes the product explicitly; there is no
 * inference from a hostname or a key.
 *
 * Sources: SAP KBA 3146449 (OAuth Authentication FAQ) for the tentative deletion
 * date; SAP's SuccessFactors API deprecation notice for the retirement milestone.
 */

/**
 * SAP's retirement milestone: Basic is deprecated, unsupported and unavailable
 * for new configurations from this day. EXISTING CALLS STILL WORK.
 */
export const SF_BASIC_AUTH_DEPRECATED_ISO = "2026-11-20" as const;

/**
 * SAP's current "Deleted" date — when Basic actually stops authenticating.
 * TENTATIVE per SAP and subject to change; override with
 * SF_BASIC_AUTH_DELETION_DATE (YYYY-MM-DD) when SAP moves it.
 */
export const SF_BASIC_AUTH_DELETION_DEFAULT_ISO = "2027-11-12" as const;

/** Env var carrying SAP's current deletion date, when it differs from the default. */
export const SF_BASIC_AUTH_DELETION_ENV = "SF_BASIC_AUTH_DELETION_DATE" as const;

/** Product keys this guard applies to. SuccessFactors only, deliberately. */
const GUARDED_PRODUCTS = new Set(["successfactors", "sf", "successfactors-hcm"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Just the lookup `process.env` provides — so a test can pass a bare object. */
type EnvLike = Record<string, string | undefined>;

export type BasicAuthVerdict =
  | { kind: "not-applicable" }
  /** Before the retirement milestone. Works, supported, migrate anyway. */
  | { kind: "allowed"; daysUntilDeprecated: number; daysUntilDeletion: number; warning: string }
  /** Retired by SAP but STILL ANSWERING. Never throws — that was the bug. */
  | { kind: "deprecated"; daysUntilDeletion: number; warning: string }
  /** On/after the deletion date. SAP no longer accepts Basic. */
  | { kind: "refused"; reason: string };

export function isGuardedSuccessFactorsProduct(product: string | null | undefined): boolean {
  return typeof product === "string" && GUARDED_PRODUCTS.has(product.trim().toLowerCase());
}

/**
 * The deletion date in effect: SAP's default unless an operator has tracked a
 * change. An unparseable override is IGNORED rather than obeyed — a typo must
 * not silently disable or prematurely trigger the refusal.
 */
export function resolveDeletionDateIso(env: EnvLike = process.env): string {
  const raw = env[SF_BASIC_AUTH_DELETION_ENV]?.trim();
  if (!raw) return SF_BASIC_AUTH_DELETION_DEFAULT_ISO;
  if (!ISO_DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    console.warn(
      `[sf-basic-auth] ${SF_BASIC_AUTH_DELETION_ENV}="${raw}" is not a YYYY-MM-DD date — ` +
        `falling back to SAP's published ${SF_BASIC_AUTH_DELETION_DEFAULT_ISO}.`,
    );
    return SF_BASIC_AUTH_DELETION_DEFAULT_ISO;
  }
  return raw;
}

function utc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function daysBetween(from: Date, toIso: string): number {
  return Math.ceil((utc(toIso) - from.getTime()) / 86_400_000);
}

/**
 * What to do about a Basic-auth SuccessFactors connection right now. Pure (the
 * clock and the environment are parameters), so both boundaries are testable
 * without waiting for them.
 */
export function successFactorsBasicAuthVerdict(
  product: string | null | undefined,
  authType: string | null | undefined,
  now: Date = new Date(),
  label = "this connection",
  env: EnvLike = process.env,
): BasicAuthVerdict {
  if (!isGuardedSuccessFactorsProduct(product)) return { kind: "not-applicable" };
  if (authType !== "basic") return { kind: "not-applicable" };

  const deletionIso = resolveDeletionDateIso(env);

  if (now.getTime() >= utc(deletionIso)) {
    return {
      kind: "refused",
      reason:
        `SAP stopped accepting HTTP Basic for SuccessFactors on ${deletionIso}; ` +
        `${label} is still configured for it. Switch it to oauth-saml-bearer — register an ` +
        `OAuth2 client under Admin Center → Manage OAuth2 Client Applications, then set the ` +
        `API key, company id, signed SAML assertion and token URL. ` +
        `If SAP has moved this date, set ${SF_BASIC_AUTH_DELETION_ENV} to the current one.`,
    };
  }

  const daysUntilDeletion = daysBetween(now, deletionIso);

  if (now.getTime() >= utc(SF_BASIC_AUTH_DEPRECATED_ISO)) {
    return {
      kind: "deprecated",
      daysUntilDeletion,
      warning:
        `${label} authenticates to SuccessFactors with HTTP Basic, which SAP RETIRED on ` +
        `${SF_BASIC_AUTH_DEPRECATED_ISO}: unsupported, and unavailable for new configurations. ` +
        `It still answers, and is scheduled for deletion on ${deletionIso} ` +
        `(${daysUntilDeletion} day(s) away — SAP calls this date tentative). ` +
        `Move it to oauth-saml-bearer now; this call is refused from the deletion date.`,
    };
  }

  return {
    kind: "allowed",
    daysUntilDeprecated: daysBetween(now, SF_BASIC_AUTH_DEPRECATED_ISO),
    daysUntilDeletion,
    warning:
      `${label} authenticates to SuccessFactors with HTTP Basic. SAP retires it on ` +
      `${SF_BASIC_AUTH_DEPRECATED_ISO} and plans to delete it on ${deletionIso}. ` +
      `Move it to oauth-saml-bearer before the retirement date.`,
  };
}

/**
 * Throw only once SAP has actually deleted Basic; warn on every step before it.
 * Call it where the Authorization header is built, so there is no path that
 * reaches SAP without passing it.
 */
export function assertSuccessFactorsBasicAuthAllowed(
  product: string | null | undefined,
  authType: string | null | undefined,
  label = "this connection",
  now: Date = new Date(),
  env: EnvLike = process.env,
): void {
  const verdict = successFactorsBasicAuthVerdict(product, authType, now, label, env);
  if (verdict.kind === "refused") throw new Error(verdict.reason);
  if (verdict.kind === "allowed" || verdict.kind === "deprecated") {
    console.warn(`[sf-basic-auth] ${verdict.warning}`);
  }
}
