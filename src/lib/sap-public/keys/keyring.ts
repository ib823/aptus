/**
 * The master-key ring for SAP connection secrets (P0.10).
 *
 * WHAT CHANGED, AND WHAT DID NOT. Until P0.10 one raw environment key,
 * `SAP_CONNECTION_ENCRYPTION_KEY`, sealed every SAP secret directly, with no key
 * id, no version and no way to rotate it short of re-typing every credential.
 * This module reads a VERSIONED ring instead:
 *
 *   SAP_CONNECTION_ENCRYPTION_KEYS="v1:<64 hex>,v2:<64 hex>"
 *   SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY="v2"
 *
 * and the legacy single key keeps working as the implicit `v1`. With ONLY the
 * legacy key set, nothing behaves differently from before: the same key opens
 * and seals the same blobs in the same format. Envelope sealing (the `ce2`
 * format, secret-envelope.ts) is switched on by naming an active key and by
 * nothing else — an explicit operator act, because a blob written in the new
 * format cannot be read by a deployment rolled back to code that predates it.
 *
 * WHY THE LEGACY KEY IS `v1` AND NOT A SEPARATE CONCEPT. Every blob sealed
 * before P0.10 was sealed under that key, so it IS the first version — giving
 * it a name lets the ring say "v1 still opens the old rows" without a special
 * case anywhere else. If both the legacy variable and a `v1:` entry are set they
 * must be the same key: two different keys answering to one name is the kind of
 * ambiguity that surfaces as "some connections stopped opening".
 *
 * READ ON EVERY CALL, NEVER CACHED. The previous helper read the environment at
 * each seal and open, and the tests (and a redeploy) rely on that: a key changed
 * in the environment is the key used next.
 */

/** The version the legacy single key answers to. */
export const LEGACY_KEY_VERSION = "v1";

/** A version label: `v` and a positive integer, so it sorts and never contains `:`. */
const VERSION_PATTERN = /^v[1-9][0-9]{0,5}$/;
const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export const ENV_LEGACY_KEY = "SAP_CONNECTION_ENCRYPTION_KEY";
export const ENV_KEYRING = "SAP_CONNECTION_ENCRYPTION_KEYS";
export const ENV_ACTIVE_KEY = "SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY";

/** The message the legacy helper has always thrown — kept word for word. */
export const LEGACY_KEY_MESSAGE =
  "SAP_CONNECTION_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with `openssl rand -hex 32`.";

type Env = Readonly<Record<string, string | undefined>>;

/** A ring that cannot be read. Its message names the variable to fix and never a key. */
export class KeyringConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyringConfigError";
  }
}

export interface MasterKeyring {
  /** Every configured version, legacy `v1` included. */
  readonly keys: ReadonlyMap<string, Buffer>;
  /** The version new data keys are wrapped under; null when none is named. */
  readonly active: string | null;
}

/** An unset variable and an empty one are the same thing — `.env.example` ships `""`. */
function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Is a version label well-formed? Exported for the provider and the scripts. */
export function isKeyVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/**
 * Parse the ring from the environment. Throws KeyringConfigError on any
 * malformed entry rather than skipping it: a skipped entry is a key that
 * silently stops opening the rows sealed under it.
 */
export function readKeyring(env: Env = process.env): MasterKeyring {
  const keys = new Map<string, Buffer>();

  const ring = env[ENV_KEYRING];
  if (present(ring)) {
    for (const raw of ring.split(",")) {
      const entry = raw.trim();
      if (entry.length === 0) continue;
      const sep = entry.indexOf(":");
      const version = sep > 0 ? entry.slice(0, sep).trim() : "";
      const hex = sep > 0 ? entry.slice(sep + 1).trim() : "";
      if (!isKeyVersion(version)) {
        throw new KeyringConfigError(
          `${ENV_KEYRING} has an entry whose version is not of the form v1, v2, …; each entry is "v<N>:<64 hex>".`,
        );
      }
      if (!HEX_KEY_PATTERN.test(hex)) {
        throw new KeyringConfigError(
          `${ENV_KEYRING} entry ${version} is not a 64-character hex key (32 bytes). Generate one with \`openssl rand -hex 32\`.`,
        );
      }
      if (keys.has(version)) {
        throw new KeyringConfigError(`${ENV_KEYRING} names ${version} twice.`);
      }
      keys.set(version, Buffer.from(hex, "hex"));
    }
  }

  const legacy = env[ENV_LEGACY_KEY];
  if (present(legacy)) {
    if (!HEX_KEY_PATTERN.test(legacy)) {
      throw new KeyringConfigError(LEGACY_KEY_MESSAGE);
    }
    const legacyKey = Buffer.from(legacy, "hex");
    const ringV1 = keys.get(LEGACY_KEY_VERSION);
    if (ringV1 && !ringV1.equals(legacyKey)) {
      throw new KeyringConfigError(
        `${ENV_LEGACY_KEY} and the ${LEGACY_KEY_VERSION} entry of ${ENV_KEYRING} are different keys. ` +
          `The legacy key IS ${LEGACY_KEY_VERSION}; set one of them, or set both to the same value.`,
      );
    }
    keys.set(LEGACY_KEY_VERSION, legacyKey);
  }

  const activeRaw = env[ENV_ACTIVE_KEY];
  const active = present(activeRaw) ? activeRaw.trim() : null;
  if (active !== null && !keys.has(active)) {
    throw new KeyringConfigError(
      `${ENV_ACTIVE_KEY} is ${isKeyVersion(active) ? active : "not a version label"}, which is not a key in ${ENV_KEYRING}.`,
    );
  }

  return { keys, active };
}

/**
 * Has the operator switched on envelope sealing? True exactly when an active
 * key is named — the ONE setting that changes what new writes look like.
 *
 * Deliberately does not validate the ring: a typo'd ring with an active key
 * must fail loudly at seal time, not quietly fall back to the legacy format the
 * operator was trying to leave.
 */
export function envelopeSealingRequested(env: Env = process.env): boolean {
  return present(env[ENV_ACTIVE_KEY]);
}

/**
 * The key that seals and opens LEGACY-format blobs (base64, no version).
 *
 * The legacy variable when it is set — validated exactly as before, with the
 * same message, so a deployment that configures nothing new sees nothing new.
 * Otherwise the ring's `v1`, which lets an operator move the old key into the
 * ring and retire the old variable without stranding a single row.
 *
 * Reads ONLY the legacy variable when it is set, so a mistake in the new ring
 * can never take away the key every existing row was sealed with.
 */
export function legacySealingKey(env: Env = process.env): Buffer {
  const hex = env[ENV_LEGACY_KEY];
  if (present(hex)) {
    if (hex.length !== 64) throw new Error(LEGACY_KEY_MESSAGE);
    return Buffer.from(hex, "hex");
  }
  if (present(env[ENV_KEYRING])) {
    const v1 = readKeyring(env).keys.get(LEGACY_KEY_VERSION);
    if (v1) return v1;
    throw new KeyringConfigError(
      `A legacy-format secret needs key ${LEGACY_KEY_VERSION}: set ${ENV_LEGACY_KEY}, or keep a ${LEGACY_KEY_VERSION} entry in ${ENV_KEYRING} until \`pnpm keys:reseal\` has moved every row to the envelope format.`,
    );
  }
  throw new Error(LEGACY_KEY_MESSAGE);
}

/**
 * Is the legacy key set the way code OLDER than P0.10 reads it?
 *
 * That code reads `SAP_CONNECTION_ENCRYPTION_KEY` and nothing else — never the
 * ring — and wants exactly 64 hex characters, untrimmed. legacySealingKey
 * above falls back to the ring's `v1`, so a deployment that moved its old key
 * into the ring seals and opens legacy blobs perfectly well here, and a
 * rollback gate that asked this code would pass; the rolled-back code would
 * then throw on every SAP connection and write key. The rollback gate asks
 * this instead.
 */
export function preEnvelopeLegacyKeyConfigured(env: Env = process.env): boolean {
  const hex = env[ENV_LEGACY_KEY];
  return typeof hex === "string" && HEX_KEY_PATTERN.test(hex);
}

/**
 * Which LEGACY-format blobs this deployment still opens.
 *
 *   any    (the default) every legacy blob, including one sealed before AAD
 *          existed, through the unbound fallback — behaviour as before P0.10
 *   bound  only legacy blobs that open under their own row's binding
 *   none   no legacy blob at all; only `ce2`
 *
 * WHY A SETTING AND NOT "REFUSE ONCE EVERY ROW IS ce2". Once a reseal has
 * moved every row to `ce2`, an unbound legacy blob from an old backup or dump
 * still opens on ANY row of ANY organisation — the swap the row binding exists
 * to stop — for as long as `v1` is configured, and a rollback needs `v1`
 * configured. Whether migration is finished is something only the operator
 * knows (a row restored from a backup is legacy again), so it is the
 * operator's switch, flipped after `keys:verify --expect-format=ce2` passes.
 *
 * A value that is not one of the three throws: a typo in a setting that
 * narrows what opens must not quietly widen it back to `any`.
 */
export type LegacyFormatPolicy = "any" | "bound" | "none";

export const ENV_ACCEPT_LEGACY_FORMAT = "SAP_CONNECTION_ACCEPT_LEGACY_FORMAT";

export function legacyFormatPolicy(env: Env = process.env): LegacyFormatPolicy {
  const raw = env[ENV_ACCEPT_LEGACY_FORMAT];
  if (!present(raw)) return "any";
  const value = raw.trim();
  if (value === "any" || value === "bound" || value === "none") return value;
  throw new KeyringConfigError(`${ENV_ACCEPT_LEGACY_FORMAT} must be any, bound or none.`);
}

/** Can a legacy-format blob be sealed or opened? Non-throwing. */
export function legacySealingKeyConfigured(env: Env = process.env): boolean {
  const hex = env[ENV_LEGACY_KEY];
  if (present(hex)) return HEX_KEY_PATTERN.test(hex);
  try {
    return readKeyring(env).keys.has(LEGACY_KEY_VERSION);
  } catch {
    return false;
  }
}
