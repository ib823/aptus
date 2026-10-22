/**
 * Credential hygiene (P0.11): how long a runtime key lives, how long the key
 * it replaced keeps working, and which prefix it carries.
 *
 * WHY EXPIRY IS MANDATORY FOR TEST AND PROD. A runtime key — and the write key
 * sealed on the same SolutionClient row — could be issued with no expiry at
 * all, so a key pasted into a CI log in its first week still read a client's
 * live SAP data years later. TEST and PROD keys now always carry one: the
 * issuer chooses it (90 days at most by default), a TEST key with none gets
 * the default, and a PROD issue without one is refused (400) rather than
 * defaulted, because a PROD key's lifetime is a decision somebody should make
 * on purpose. SANDBOX and DEV keep their old freedom: they read sandbox or
 * development data, and a forced expiry there is a chore with no risk behind it.
 *
 * WHY ROTATION OVERLAPS. Rotation used to cut over at once: the old key died
 * the instant the new one was shown, so every rotation was an outage for
 * however long the deployment took to pick the new key up. The replaced key
 * now keeps authenticating for an overlap window (24 hours by default). A
 * SUSPECTED LEAK IS NOT A ROTATION: revoke, which ends the current and the
 * previous key at once, then issue a new one.
 *
 * WHY TWO PREFIXES. `ce_live_` keys reach production data and `ce_test_` keys
 * do not, so a leaked string says how bad it is before anyone looks it up,
 * and a secret scanner can rank it (docs/coreedge/secret-scanning.md). Keys
 * minted before P0.11 carry the plain `ce_` prefix and keep working until
 * they expire.
 *
 * EXISTING KEYS ARE UNTOUCHED ON DEPLOY. Nothing here is checked when a key
 * AUTHENTICATES — only when one is minted. A TEST or PROD key issued before
 * P0.11 with no expiry keeps working, and every screen shows it as
 * "no expiry - set one" until someone rotates it.
 *
 * Every setting is read per call, so a test (or an operator's redeploy) sees
 * the value it set, and a value that does not parse falls back to the default
 * with a warning rather than to something nobody chose.
 */

import type { Prisma } from "@prisma/client";

/** The prefix every runtime key has carried; a key minted before P0.11 carries only this. */
export const LEGACY_TOKEN_PREFIX = "ce_";
/** A key for PROD: it reaches production data. */
export const LIVE_TOKEN_PREFIX = "ce_live_";
/** A key for SANDBOX, DEV or TEST. */
export const TEST_TOKEN_PREFIX = "ce_test_";

export type ClientTokenPrefix =
  | typeof LEGACY_TOKEN_PREFIX
  | typeof LIVE_TOKEN_PREFIX
  | typeof TEST_TOKEN_PREFIX;

/** The prefix a key minted now for this environment carries. */
export function tokenPrefixFor(environment: string): typeof LIVE_TOKEN_PREFIX | typeof TEST_TOKEN_PREFIX {
  return environment.toUpperCase() === "PROD" ? LIVE_TOKEN_PREFIX : TEST_TOKEN_PREFIX;
}

/**
 * The four characters a masked key reference ends in (P0.3, A45): the last
 * four of the TOKEN, stored beside its hash as `SolutionClient.tokenTail` by
 * every path that mints one. The claim page shows the same four, so the
 * reference the recipient is told to expect is the one every console shows.
 * Four base64url characters of a 32-byte key are not a secret.
 *
 * Written in the SAME update as the new `tokenHash`: a database trigger
 * clears the tail of any key change that does not write one
 * (migration 20261025040000_token_tail_binding), so a key changed by code
 * that predates the column never keeps the previous key's ending.
 */
export const TOKEN_TAIL_LENGTH = 4;

export function tokenTailOf(rawToken: string): string {
  return rawToken.slice(-TOKEN_TAIL_LENGTH);
}

/** The stored prefix, read defensively: anything unrecognised reads as legacy. */
export function storedTokenPrefix(value: string | null | undefined): ClientTokenPrefix {
  return value === LIVE_TOKEN_PREFIX || value === TEST_TOKEN_PREFIX ? value : LEGACY_TOKEN_PREFIX;
}

/** TEST and PROD may not be issued a key that never expires. */
export function requiresExpiry(environment: string): boolean {
  const env = environment.toUpperCase();
  return env === "TEST" || env === "PROD";
}

/* ── settings ─────────────────────────────────────────────────────────── */

export type KeyExpiryMode = "enforce" | "off";

/**
 * COREEDGE_KEY_EXPIRY. `enforce` (the default) applies the rules above to
 * every key minted from now on; `off` restores the old behaviour — any expiry
 * or none — and exists as the rollback lever, not as a steady state.
 *
 * Enforce is a safe default because it is asked only when a key is MINTED:
 * no existing key, and no running integration, is affected by it.
 */
export function keyExpiryMode(): KeyExpiryMode {
  return process.env.COREEDGE_KEY_EXPIRY?.trim().toLowerCase() === "off" ? "off" : "enforce";
}

export const DEFAULT_KEY_MAX_TTL_DAYS = 90;
export const DEFAULT_KEY_TTL_DAYS = 90;
export const DEFAULT_ROTATION_OVERLAP_HOURS = 24;
/**
 * Ceilings on the settings themselves, so a typo cannot turn "mandatory
 * expiry" into ten years, or an overlap into a second permanent key.
 */
const TTL_CEILING_DAYS = 365;
const OVERLAP_CEILING_HOURS = 168;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const warned = new Set<string>();

function integerSetting(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (Number.isInteger(value) && value >= min && value <= max) return value;
  if (!warned.has(`${name}=${raw}`)) {
    warned.add(`${name}=${raw}`);
    console.warn(`[key-policy] ${name}=${raw} is not a whole number from ${min} to ${max}; using ${fallback}`);
  }
  return fallback;
}

/** COREEDGE_KEY_MAX_TTL_DAYS: the longest a TEST or PROD key may live. */
export function keyMaxTtlDays(): number {
  return integerSetting("COREEDGE_KEY_MAX_TTL_DAYS", DEFAULT_KEY_MAX_TTL_DAYS, 1, TTL_CEILING_DAYS);
}

/**
 * COREEDGE_KEY_DEFAULT_TTL_DAYS: the lifetime a TEST or PROD key gets when
 * nobody chose one — a TEST issue, a rotation, a claim link. Never longer than
 * the maximum, whatever it is set to.
 */
export function keyDefaultTtlDays(): number {
  return Math.min(
    integerSetting("COREEDGE_KEY_DEFAULT_TTL_DAYS", DEFAULT_KEY_TTL_DAYS, 1, TTL_CEILING_DAYS),
    keyMaxTtlDays(),
  );
}

/**
 * COREEDGE_KEY_ROTATION_OVERLAP_HOURS: how long a replaced key keeps working.
 * 0 switches the overlap off (rotation cuts over at once, as it used to).
 */
export function rotationOverlapHours(): number {
  return integerSetting(
    "COREEDGE_KEY_ROTATION_OVERLAP_HOURS",
    DEFAULT_ROTATION_OVERLAP_HOURS,
    0,
    OVERLAP_CEILING_HOURS,
  );
}

/* ── expiry ───────────────────────────────────────────────────────────── */

export type KeyExpiryRefusal = "missingExpiry" | "expiryInPast" | "expiryTooFar";

export type KeyExpiryResolution =
  | { readonly ok: true; readonly expiresAt: Date | null }
  | { readonly ok: false; readonly refusal: KeyExpiryRefusal; readonly message: string };

/** The latest expiry a TEST or PROD key minted now may carry. */
export function latestAllowedExpiry(now: Date): Date {
  return new Date(now.getTime() + keyMaxTtlDays() * DAY_MS);
}

/** The expiry a TEST or PROD key gets when nobody chose one. */
export function defaultKeyExpiry(now: Date): Date {
  return new Date(now.getTime() + keyDefaultTtlDays() * DAY_MS);
}

function refuse(refusal: KeyExpiryRefusal, environment: string, now: Date): KeyExpiryResolution {
  const env = environment.toUpperCase();
  const max = keyMaxTtlDays();
  const latest = latestAllowedExpiry(now).toISOString().slice(0, 10);
  const message =
    refusal === "missingExpiry"
      ? `A ${env} key must have an expiry. Choose one up to ${max} days from today (on or before ${latest}).`
      : refusal === "expiryTooFar"
        ? `A ${env} key may live at most ${max} days. Choose an expiry on or before ${latest}.`
        : "That expiry has already passed. A key minted with it would be refused on its first call.";
  return { ok: false, refusal, message };
}

/**
 * The expiry for a key minted now, or why it may not be minted.
 *
 * `purpose` says who chose: `issue` is a person filling in the issue form, and
 * a PROD issue without an expiry is refused so somebody decides it; `renew`
 * is a rotation or a claim link, where nobody was asked, so TEST and PROD get
 * the default lifetime instead.
 */
export function resolveKeyExpiry(input: {
  readonly environment: string;
  readonly requested: Date | null | undefined;
  readonly now: Date;
  readonly purpose: "issue" | "renew";
}): KeyExpiryResolution {
  const { environment, requested, now, purpose } = input;
  if (keyExpiryMode() === "off") return { ok: true, expiresAt: requested ?? null };

  if (requested !== null && requested !== undefined) {
    if (Number.isNaN(requested.getTime()) || requested.getTime() <= now.getTime()) {
      return refuse("expiryInPast", environment, now);
    }
    if (requiresExpiry(environment) && requested.getTime() > latestAllowedExpiry(now).getTime()) {
      return refuse("expiryTooFar", environment, now);
    }
    return { ok: true, expiresAt: requested };
  }

  if (!requiresExpiry(environment)) return { ok: true, expiresAt: null };
  if (purpose === "issue" && environment.toUpperCase() === "PROD") {
    return refuse("missingExpiry", environment, now);
  }
  return { ok: true, expiresAt: defaultKeyExpiry(now) };
}

/**
 * The expiry for a key that REPLACES one on the same row — a rotation, a
 * re-issue or a claim — when the caller may or may not have chosen one.
 *
 * Where expiry is not mandatory (SANDBOX, DEV, or the policy switched off)
 * and nobody chose one, the row keeps its current expiry unless it has
 * already passed: renewal must never hand over a key that is refused on its
 * first call (audit A48). Where it is mandatory, the new key gets a fresh
 * lifetime — rotation is how a TEST or PROD key is renewed, and how a key
 * issued before P0.11 with no expiry gets one.
 */
export function expiryOnRenewal(input: {
  readonly environment: string;
  readonly requested: Date | null | undefined;
  readonly current: Date | null;
  readonly now: Date;
}): KeyExpiryResolution {
  const { environment, requested, current, now } = input;
  const chosen = requested !== null && requested !== undefined;
  if (!chosen && (keyExpiryMode() === "off" || !requiresExpiry(environment))) {
    return { ok: true, expiresAt: current !== null && current.getTime() > now.getTime() ? current : null };
  }
  return resolveKeyExpiry({ environment, requested, now, purpose: "renew" });
}

/* ── rotation overlap ─────────────────────────────────────────────────── */

/** The row a new key is about to replace, as the overlap needs to see it. */
export interface ReplacedKey {
  readonly tokenHash: string;
  readonly isActive: boolean;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
}

/**
 * Until when a key replaced at `now` keeps working — the end of the window
 * `overlapFields` would open — or null when none would open: nothing live is
 * replaced, the overlap is switched off, or the key ends now anyway.
 *
 * Separate from `overlapFields` so a screen can say BEFORE the replacement
 * what it will leave of the old key (review round 2: the claim screen and
 * the Studio Rotate button promised the full overlap to a key that expired
 * sooner). `overlapHours` is passed in, so a browser component can call it
 * with the server's setting; it defaults to the setting itself.
 */
export function replacedKeyValidUntil(
  replaced: KeyLiveness | null,
  now: Date,
  newExpiresAt: Date | null,
  overlapHours: number = rotationOverlapHours(),
): Date | null {
  const overlapMs = overlapHours * HOUR_MS;
  if (replaced === null || overlapMs <= 0) return null;
  if (!isKeyLive(replaced, now)) return null;

  let until = now.getTime() + overlapMs;
  if (replaced.expiresAt != null) until = Math.min(until, replaced.expiresAt.getTime());
  if (newExpiresAt != null) until = Math.min(until, newExpiresAt.getTime());
  return until > now.getTime() ? new Date(until) : null;
}

/**
 * When a key replaced at `now` would stop SOONER than the full overlap — its
 * own expiry, or the new key's, ends the window first — else null. What a
 * screen names instead of "N hours" when the hours would overstate it.
 */
export function replacedKeyStopsEarly(
  replaced: KeyLiveness | null,
  now: Date,
  newExpiresAt: Date | null,
  overlapHours: number = rotationOverlapHours(),
): Date | null {
  const until = replacedKeyValidUntil(replaced, now, newExpiresAt, overlapHours);
  return until !== null && until.getTime() < now.getTime() + overlapHours * HOUR_MS ? until : null;
}

/**
 * What a rotation does to the key in use, in words that follow the overlap
 * setting — so no screen or refusal says "nothing fails" when the operator
 * has switched the overlap off and the rotation cuts over at once (review
 * round 2). Pure, so a browser component can call it with the server's value.
 */
export function rotationOverlapSentence(overlapHours: number): string {
  return overlapHours > 0
    ? `the key it replaces keeps working for up to ${overlapHours} hours, never past its own expiry, so nothing fails while the new one is deployed`
    : "the key it replaces stops at once, so the new one must be deployed straight away";
}

export interface OverlapFields {
  readonly previousTokenHash: string | null;
  readonly previousValidUntil: Date | null;
  /**
   * The `tokenHash` the overlap was opened for: the key that replaced
   * `previousTokenHash`. Authentication honours the overlap only while the
   * row's current `tokenHash` is still this one (see `overlapStillBound`).
   */
  readonly overlapForTokenHash: string | null;
}

/** No previous key: what a first issue, or the replacement of an ended key, writes. */
export const NO_OVERLAP: OverlapFields = {
  previousTokenHash: null,
  previousValidUntil: null,
  overlapForTokenHash: null,
};

/**
 * What a key change writes into the overlap columns.
 *
 * Only a key that is LIVE at the moment it is replaced overlaps. A revoked,
 * deactivated or expired key has already stopped, and replacing it must not
 * bring it back for a day — that would turn every re-issue after a revocation
 * into an un-revocation. The window never outlasts the replaced key's own
 * expiry, nor the new key's: an overlap extends nobody's lifetime.
 *
 * Writing the fields every time, including NO_OVERLAP, is deliberate: the
 * key that was "previous" before this change is dropped, so only the
 * immediately previous key ever overlaps.
 *
 * The overlap is BOUND to the key change that opened it: `newTokenHash`, the
 * hash being written as the row's `tokenHash` in the same update, is recorded
 * beside it as `overlapForTokenHash`.
 */
export function overlapFields(
  replaced: ReplacedKey | null,
  now: Date,
  newExpiresAt: Date | null,
  newTokenHash: string,
): OverlapFields {
  const until = replacedKeyValidUntil(replaced, now, newExpiresAt);
  if (replaced === null || until === null) return NO_OVERLAP;
  return {
    previousTokenHash: replaced.tokenHash,
    previousValidUntil: until,
    overlapForTokenHash: newTokenHash,
  };
}

/**
 * The key hashes a key change DROPS from the row: the current key when it
 * does not move to `previousTokenHash` (nothing live was replaced, the overlap
 * is off, or the binding changed), and the previous key the change pushes out.
 *
 * Recorded in RetiredClientToken in the same update (`retiredKeysWrite`), so a
 * call with one still resolves to its row and is refused as REVOKED or
 * ROTATED_OUT, never as UNKNOWN_TOKEN (wave 1a final review). An unknown key
 * spends its caller address's failed-lookup bucket; a dead real key retried
 * behind a shared egress — the leaked key after the runbook's revoke-then-
 * reissue, a deployment two rotations behind — then locked every other
 * tenant's valid key on that address out at the edge.
 */
export function retiredHashes(
  replaced: { readonly tokenHash: string; readonly previousTokenHash?: string | null } | null,
  written: OverlapFields,
): string[] {
  if (replaced === null) return [];
  const dropped = new Set<string>();
  if (written.previousTokenHash !== replaced.tokenHash) dropped.add(replaced.tokenHash);
  const previous = replaced.previousTokenHash ?? null;
  if (previous !== null && previous !== written.previousTokenHash) dropped.add(previous);
  return [...dropped];
}

/**
 * The nested write that records `retiredHashes` on the row being updated, or
 * nothing when the change drops no key. Spread into the same update as the
 * overlap fields, so the record and the key change commit together.
 */
export function retiredKeysWrite(
  organizationId: string,
  replaced: { readonly tokenHash: string; readonly previousTokenHash?: string | null } | null,
  written: OverlapFields,
  now: Date,
): { retiredTokens?: Prisma.RetiredClientTokenUpdateManyWithoutClientNestedInput } {
  const hashes = retiredHashes(replaced, written);
  if (hashes.length === 0) return {};
  return {
    retiredTokens: {
      createMany: {
        data: hashes.map((tokenHash) => ({ tokenHash, organizationId, retiredAt: now })),
        skipDuplicates: true,
      },
    },
  };
}

/** Is the previous key still inside its overlap window? */
export function overlapIsOpen(previousValidUntil: Date | null | undefined, now: Date): boolean {
  return previousValidUntil instanceof Date && previousValidUntil.getTime() > now.getTime();
}

/**
 * Does the overlap still belong to the row's current key?
 *
 * WHY THE OVERLAP IS BOUND. The code before P0.11 knows nothing of the
 * overlap columns, so a deploy rolled back after a rotation leaves them in
 * place, and every key change made under it — a rotation meant as an
 * immediate cut-over, or the revoke-then-reissue that answers a leak — writes
 * a new `tokenHash` and `revokedAt: null` beside a window it cannot see. Rolled
 * forward inside that window, the replaced (perhaps leaked) key would
 * authenticate again. Any change of `tokenHash` that did not write the
 * overlap breaks this match, so the window fails closed whichever build made
 * the change, and no runbook step is needed for the key to stay dead.
 */
export function overlapStillBound(row: {
  readonly tokenHash: string;
  readonly overlapForTokenHash: string | null;
}): boolean {
  return row.overlapForTokenHash !== null && row.overlapForTokenHash === row.tokenHash;
}

/* ── is it live? one predicate for every screen ───────────────────────── */

export interface KeyLiveness {
  readonly isActive: boolean;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
}

/**
 * Does this key authenticate right now? The same rule authenticateClientToken
 * applies, so no screen can call a key live that the broker refuses — an
 * expired key above all, which several screens counted as live because they
 * looked only at `isActive` and `revokedAt`.
 */
export function isKeyLive(key: KeyLiveness, now: Date): boolean {
  if (key.revokedAt != null || !key.isActive) return false;
  // `== null`: a row read without the column has no expiry to judge, which
  // is what an absent value means — never a reason to crash a screen.
  return key.expiresAt == null || key.expiresAt.getTime() > now.getTime();
}

/** Why a key that resolved to its row does not authenticate, most specific first. */
export type KeyRefusal = "REVOKED" | "INACTIVE" | "ROTATED_OUT" | "EXPIRED";

/** How the presented key matched its row: as the current key, or as one the row replaced. */
export interface PresentedKey {
  /** The key matched the row's previous key, or one the row has dropped. */
  readonly viaPreviousKey: boolean;
  /** The overlap still belongs to the row's current key (`overlapStillBound`). */
  readonly previousKeyBound: boolean;
}

/** The row's CURRENT key: what the lane board asks about, since it holds no token. */
export const CURRENT_KEY: PresentedKey = { viaPreviousKey: false, previousKeyBound: false };

/**
 * THE KEY HOP, as authentication applies it and the lane board previews it
 * (P0.2): revoked before inactive (a revoked token is a security event worth
 * seeing as exactly that), then the rotation overlap, then the row's expiry.
 * `isKeyLive` is this rule for the current key, as a yes or no.
 */
export function keyRefusal(
  row: KeyLiveness & { readonly previousValidUntil?: Date | null },
  now: Date,
  presented: PresentedKey = CURRENT_KEY,
): KeyRefusal | null {
  if (row.revokedAt != null) return "REVOKED";
  if (!row.isActive) return "INACTIVE";
  if (presented.viaPreviousKey && (!presented.previousKeyBound || !overlapIsOpen(row.previousValidUntil, now))) {
    return "ROTATED_OUT";
  }
  if (row.expiresAt != null && row.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return null;
}

/** The same rule as a Prisma filter, for counts and lists. */
export function liveKeyWhere(now: Date) {
  return {
    isActive: true,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } satisfies Prisma.SolutionClientWhereInput;
}

/** What the screens say about a key with no expiry where one is now required. */
export const NO_EXPIRY_LABEL = "no expiry - set one";
/*
 * No promise about the overlap here: this is shown in browser components that
 * cannot read the setting, and with COREEDGE_KEY_ROTATION_OVERLAP_HOURS=0 the
 * rotation cuts over at once (review round 2). The rotation's own response
 * says until when the replaced key works.
 */
export const NO_EXPIRY_MEANING =
  "issued before TEST and PROD keys had to expire. It keeps working; rotate it to give it an expiry, then deploy the new key before the replaced one stops — the rotation says when.";

/**
 * A live TEST or PROD key that never expires: legal, because it predates
 * P0.11, and flagged everywhere until someone rotates it.
 */
export function lacksRequiredExpiry(key: KeyLiveness & { readonly environment: string }, now: Date): boolean {
  return isKeyLive(key, now) && key.expiresAt == null && requiresExpiry(key.environment);
}

export type KeyState = "revoked" | "inactive" | "expired" | "noExpiry" | "active";

/**
 * The words every screen uses for a key's state — Studio, the Operations
 * Center, Control Tower and the CoreEdge console — so one key cannot read
 * "active" on one screen and "expired" on another. `none` is a lane with no key.
 */
export const KEY_STATE_LABELS: Readonly<Record<KeyState | "none", string>> = {
  active: "live",
  noExpiry: `live · ${NO_EXPIRY_LABEL}`,
  expired: "expired",
  revoked: "revoked",
  inactive: "not active",
  none: "no key",
};

/**
 * One key's state, most decisive first. Revoked before expired (a revoked key
 * is the more specific event, as in authentication); `noExpiry` is a live key
 * that should have an expiry and does not.
 */
export function keyState(key: KeyLiveness & { readonly environment: string }, now: Date): KeyState {
  if (key.revokedAt != null) return "revoked";
  if (!key.isActive) return "inactive";
  if (key.expiresAt != null && key.expiresAt.getTime() <= now.getTime()) return "expired";
  if (lacksRequiredExpiry(key, now)) return "noExpiry";
  return "active";
}
