/**
 * CoreEdge's own token keys: a versioned ring for what CoreEdge seals or
 * keys for itself, separate from the SAP master-key ring (P1.4).
 *
 *   COREEDGE_TOKEN_KEYS="t1:<64 hex>,t2:<64 hex>"
 *   COREEDGE_TOKEN_ACTIVE_KEY="t2"
 *
 * WHY NOT THE SAP RING. The SAP ring (sap-public/keys/keyring.ts) wraps every
 * customer's connection secrets, and its rotation is a reseal of every row.
 * A paging cursor is a fifteen-minute token handed to a caller's app; tying
 * its key to the key that guards SAP passwords would make a cursor-key
 * incident a secrets incident, and a secrets rotation a cursor outage. So the
 * same SHAPE (labelled entries, an active label, read on every call), and a
 * different key.
 *
 * ONE RING, SEVERAL PURPOSES. No ring key is ever used directly. Each use
 * derives its own key with HKDF-SHA256 (salt `coreedge/token-ring/v1`, info =
 * the purpose), so the cursor's cipher key, the last-row tag key and the
 * audit hash key are unrelated, and a later purpose (P2.5's tokens, P3.10's
 * anchors) derives its own without reusing any of them. The audit hash is
 * keyed per organisation: its salt is the organisation id.
 *
 * READ ON EVERY CALL, NEVER CACHED, as the SAP ring is: a key changed in the
 * environment is the key used next, and a test can change it with stubEnv.
 *
 * OUTSIDE PRODUCTION ONLY, A DERIVED RING. With no ring configured and
 * NODE_ENV `development` or `test`, the ring is one key, `t0`, derived from
 * NEXTAUTH_SECRET (the WebAuthn precedent, auth/webauthn.ts), so a developer
 * pages through a local instance without setting anything. `t0` is never
 * accepted when NODE_ENV is anything else, which includes every Vercel
 * deployment, previews too: those set the ring, and the production check
 * (scripts/check-production-env.js) insists on it once the query surface is on.
 */

import { hkdfSync } from "node:crypto";

export const ENV_TOKEN_KEYS = "COREEDGE_TOKEN_KEYS";
export const ENV_TOKEN_ACTIVE_KEY = "COREEDGE_TOKEN_ACTIVE_KEY";

/** A label: `t` and a positive integer, so it sorts and never contains `:` or `.`. */
const LABEL_PATTERN = /^t[1-9][0-9]{0,5}$/;
const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

/** The label of the derived development ring. Never a configured label. */
export const DEV_RING_LABEL = "t0";

/** The salt every purpose but the audit hash derives under. */
export const TOKEN_RING_SALT = "coreedge/token-ring/v1";

/** HKDF info strings, one per use. Never reuse one for a different use. */
export const TOKEN_PURPOSES = {
  cursor: "coreedge/northbound-cursor/v1",
  cursorLastKey: "coreedge/northbound-cursor-lastkey/v1",
  auditQueryHash: "coreedge/audit-query-hash/v1",
} as const;

export type TokenPurpose = (typeof TOKEN_PURPOSES)[keyof typeof TOKEN_PURPOSES];

const DEV_RING_INFO = "coreedge/dev-token-ring/v1";
/** Used only under NODE_ENV=test with no NEXTAUTH_SECRET, as WebAuthn does. */
const TEST_ONLY_SECRET = "test-only-coreedge-token-ring-do-not-use";

type Env = Readonly<Record<string, string | undefined>>;

/** A ring that cannot be read. Its message names the variable to fix and never a key. */
export class TokenRingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRingConfigError";
  }
}

export interface TokenRing {
  readonly keys: ReadonlyMap<string, Buffer>;
  /** The label new tokens are sealed under. Always a key of `keys`. */
  readonly active: string;
  /** True for the derived development ring (`t0`). */
  readonly derived: boolean;
}

/** An unset variable and an empty one are the same thing — `.env.example` ships `""`. */
function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Is a label well-formed? `t0` is not: it is never configured. */
export function isTokenKeyLabel(value: string): boolean {
  return LABEL_PATTERN.test(value);
}

/**
 * Parse the ring from the environment. Throws TokenRingConfigError on any
 * malformed or duplicate entry rather than skipping it: a skipped entry is a
 * key whose cursors silently stop opening.
 */
export function readTokenRing(env: Env = process.env): TokenRing {
  const ring = env[ENV_TOKEN_KEYS];
  const activeRaw = env[ENV_TOKEN_ACTIVE_KEY];
  if (!present(ring) && !present(activeRaw)) return derivedRing(env);

  const keys = new Map<string, Buffer>();
  for (const raw of (ring ?? "").split(",")) {
    const entry = raw.trim();
    if (entry.length === 0) continue;
    const sep = entry.indexOf(":");
    const label = sep > 0 ? entry.slice(0, sep).trim() : "";
    const hex = sep > 0 ? entry.slice(sep + 1).trim() : "";
    if (!isTokenKeyLabel(label)) {
      throw new TokenRingConfigError(
        `${ENV_TOKEN_KEYS} has an entry whose label is not of the form t1, t2, …; each entry is "t<N>:<64 hex>".`,
      );
    }
    if (!HEX_KEY_PATTERN.test(hex)) {
      throw new TokenRingConfigError(
        `${ENV_TOKEN_KEYS} entry ${label} is not a 64-character hex key (32 bytes). Generate one with \`openssl rand -hex 32\`.`,
      );
    }
    if (keys.has(label)) throw new TokenRingConfigError(`${ENV_TOKEN_KEYS} names ${label} twice.`);
    keys.set(label, Buffer.from(hex, "hex"));
  }
  if (keys.size === 0) throw new TokenRingConfigError(`${ENV_TOKEN_ACTIVE_KEY} is set but ${ENV_TOKEN_KEYS} holds no key.`);
  if (!present(activeRaw)) {
    throw new TokenRingConfigError(`${ENV_TOKEN_KEYS} is set but ${ENV_TOKEN_ACTIVE_KEY} is not; name the key new tokens are sealed under.`);
  }
  const active = activeRaw.trim();
  if (!keys.has(active)) {
    throw new TokenRingConfigError(
      `${ENV_TOKEN_ACTIVE_KEY} is ${isTokenKeyLabel(active) ? active : "not a key label"}, which is not a key in ${ENV_TOKEN_KEYS}.`,
    );
  }
  return { keys, active, derived: false };
}

/** The development ring: `t0` from NEXTAUTH_SECRET, outside production only. */
function derivedRing(env: Env): TokenRing {
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test") {
    throw new TokenRingConfigError(
      `${ENV_TOKEN_KEYS} and ${ENV_TOKEN_ACTIVE_KEY} are not set. Generate a key with \`openssl rand -hex 32\` and set both.`,
    );
  }
  const secret = env.NEXTAUTH_SECRET;
  const ikm = present(secret) && secret.length >= 16 ? secret : nodeEnv === "test" ? TEST_ONLY_SECRET : null;
  if (ikm === null) {
    throw new TokenRingConfigError(
      `${ENV_TOKEN_KEYS} is not set, and NEXTAUTH_SECRET (at least 16 characters) is needed to derive the development ring.`,
    );
  }
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(ikm, "utf8"), Buffer.alloc(0), DEV_RING_INFO, 32));
  return { keys: new Map([[DEV_RING_LABEL, key]]), active: DEV_RING_LABEL, derived: true };
}

/** Can the ring be read? Non-throwing, for the route's misconfiguration check. */
export function tokenRingReadable(env: Env = process.env): boolean {
  try {
    readTokenRing(env);
    return true;
  } catch (err) {
    if (err instanceof TokenRingConfigError) return false;
    throw err;
  }
}

/**
 * The key for one purpose under one ring label: HKDF-SHA256 over the ring
 * key, 32 bytes. Throws when the label is not in the ring; callers that take
 * the label from outside (a cursor's kid) check it first.
 */
export function deriveTokenKey(ring: TokenRing, label: string, purpose: TokenPurpose, salt: string = TOKEN_RING_SALT): Buffer {
  const ikm = ring.keys.get(label);
  if (!ikm) throw new TokenRingConfigError(`The token ring has no key ${isTokenKeyLabel(label) || label === DEV_RING_LABEL ? label : "by that label"}.`);
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.from(salt, "utf8"), purpose, 32));
}
