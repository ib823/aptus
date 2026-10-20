/**
 * AES-256-GCM encryption for per-Organization SAP connection secrets.
 *
 * A SapConnection stores its non-secret fields (baseUrl, authType, label) in
 * plaintext columns and its SECRETS (password / bearer token / client secret)
 * as a single encrypted JSON bundle. This module, with secret-envelope.ts
 * on top of it, is the ONLY sanctioned path to seal/open that bundle.
 *
 * Mirrors src/lib/intelligence/ai-key-crypto.ts (the established BYOAI key
 * pattern) so the crypto convention is uniform across the codebase: IV(12) +
 * ciphertext + authTag(16), base64-encoded, AES-256-GCM.
 *
 * Requires SAP_CONNECTION_ENCRYPTION_KEY — a 32-byte key as 64 hex chars.
 * Generate one with:  openssl rand -hex 32
 *
 * TWO FORMATS SINCE P0.10. This module seals and opens the LEGACY format —
 * base64, no version, sealed directly under the legacy key (the keyring's `v1`,
 * keys/keyring.ts). The envelope format, `ce2:<dataKeyVersion>:<iv>:<ct>`, is
 * sealed under a per-organisation data key and needs a database read to open,
 * so it lives in secret-envelope.ts behind an async API: `sealSecretsForOrg` /
 * `openSecretsForOrg`. Those are what every call site uses; they open both
 * formats, and write `ce2` only once an operator has named an active master
 * key. With only the legacy key configured, every byte this module produces is
 * what it produced before P0.10.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { envelopeSealingEnabled, getKeyProvider } from "@/lib/sap-public/keys/key-provider";
import {
  legacyFormatPolicy,
  legacySealingKey,
  legacySealingKeyConfigured,
} from "@/lib/sap-public/keys/keyring";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** The secret half of a connection — never stored or logged in plaintext. */
export interface SapConnectionSecrets {
  /** basic auth */
  username?: string;
  password?: string;
  /** static bearer */
  bearerToken?: string;
  /** oauth client-credentials */
  clientId?: string;
  clientSecret?: string;
  /**
   * OAuth 2.0 SAML bearer assertion — SuccessFactors.
   *
   * `clientId` above doubles as the SF API key. `companyId` is the SF company
   * identifier, which the token endpoint requires alongside the assertion.
   *
   * TWO WAYS TO SUPPLY THE ASSERTION, and the second is the one to use.
   *
   * `samlAssertion` is a PRE-SIGNED assertion pasted in from SAP's offline
   * generator or an IdP. It was the only option while signing here would have
   * been unverifiable cryptography in an auth path — and it has a lifetime:
   * SAP's generator defaults to ten minutes (`expireInMinutes`), after which
   * every token exchange fails until someone pastes a new one.
   *
   * `samlPrivateKey` + `samlUserId` let CoreEdge sign a FRESH assertion for each
   * token request (saml-assertion.ts), with the key from the OAuth client
   * registration. The signer is verified independently: its output is checked
   * by xmlsec1, the reference XML-DSig implementation, and pinned by a
   * deterministic test vector. When both are present, the key wins — a stored
   * assertion is the fallback, never a second credential sent alongside.
   */
  samlAssertion?: string;
  companyId?: string;
  /**
   * The RSA private key of the X.509 certificate registered for this API key
   * under Admin Center → Manage OAuth2 Client Applications. PEM (PKCS#8 or
   * PKCS#1) or headerless base64 PKCS#8, as SAP's offline tool takes it.
   */
  samlPrivateKey?: string;
  /** The SuccessFactors user the assertion is issued for — its NameID. */
  samlUserId?: string;
  /**
   * API-key header auth (AD-12). SAP's Business Accelerator Hub sandbox — the
   * first thing a developer prototyping against SAP reaches for — requires an
   * `apikey` request header and ignores `Authorization` entirely; every other
   * type here produces an Authorization header. `apiKeyHeader` names the
   * header (default "apikey"), so other API-key gateways work too.
   */
  apiKey?: string;
  apiKeyHeader?: string;
  /** guarded-write secret (mirrors {PREFIX}_WRITE_SECRET) */
  writeSecret?: string;
}

/**
 * Is the encryption key configured well enough to store a secret?
 *
 * EXPORTED SO A SCREEN CAN ASK BEFORE IT OFFERS THE FORM. Without the key,
 * getEncryptionKey throws and every connection save 500s — on the first action
 * of the whole journey, after the developer has typed a client's SAP
 * credentials into a form that could never have stored them. The error was
 * honest about being a deployment problem, but it arrived one step too late to
 * stop that happening.
 *
 * Deliberately mirrors the length check below rather than trying the key: the
 * question a page needs answered is "will this deployment accept a secret",
 * which is exactly this predicate, and a page must not need a plaintext to ask.
 */
export function isConnectionEncryptionConfigured(): boolean {
  // Once envelope sealing is switched on, a save writes `ce2`, so the question
  // is whether the key provider can wrap a data key. Until then it is the
  // legacy key, checked exactly as before — unless legacy blobs are refused
  // outright, in which case a legacy save could never be opened again.
  if (envelopeSealingEnabled()) {
    try {
      return getKeyProvider().isConfigured();
    } catch {
      return false;
    }
  }
  try {
    if (legacyFormatPolicy() === "none") return false;
  } catch {
    return false;
  }
  return legacySealingKeyConfigured();
}

/**
 * The legacy key: SAP_CONNECTION_ENCRYPTION_KEY, or the keyring's `v1` once it
 * has moved there. Same validation and the same message as before P0.10.
 */
function getEncryptionKey(): Buffer {
  return legacySealingKey();
}

/** The envelope prefix. A legacy blob is base64 and can never contain `:`. */
const ENVELOPE_PREFIX = "ce2:";

/**
 * Additional Authenticated Data — binds a ciphertext to the ROW it belongs to.
 *
 * Without AAD, a blob is a free-floating secret: anyone who can write to the
 * table could copy tenant A's `secretsCiphertext` onto tenant B's connection row
 * and the platform would happily decrypt it and authenticate to A's SAP system
 * as B. GCM authenticates the AAD alongside the ciphertext, so a blob sealed for
 * one identity simply fails to open under another's.
 *
 * Build it from values that identify the row and cannot be edited to point
 * elsewhere without also changing what the row IS.
 */
export function connectionAad(organizationId: string, product: string, key: string): string {
  return `sapconn:v1:${organizationId}:${product}:${key}`;
}

/**
 * AAD for a per-solution runtime client (Phase D).
 *
 * SUPERSEDED by solutionClientRowAad — kept so a v1 blob can be RECOGNISED and
 * reported, never accepted. See the note there.
 */
export function solutionClientAad(organizationId: string, solutionId: string): string {
  return `solclient:v1:${organizationId}:${solutionId}`;
}

/**
 * AAD for ONE runtime credential row.
 *
 * v1 bound a sealed write key to (organization, solution), which identified the
 * row only while a solution could hold a single credential. AD-11 made that one
 * row per ENVIRONMENT, and the binding silently stopped being a binding: every
 * credential of a solution shared an AAD, so a ciphertext moved from the TEST
 * row onto the DEV row still opened — and the whole point of the AAD is that
 * write access to the database is not enough to forge a write key, because the
 * encryption key lives outside it.
 *
 * The clientId restores that: a blob opens on exactly the row it was sealed for.
 */
export function solutionClientRowAad(
  organizationId: string,
  solutionId: string,
  clientId: string,
): string {
  return `solclient:v2:${organizationId}:${solutionId}:${clientId}`;
}

/**
 * Encrypt a UTF-8 string → base64(IV + ciphertext + authTag).
 *
 * `aad` is optional so this stays backward compatible: blobs sealed before AAD
 * existed have none, and must keep opening (see decryptSecret).
 */
export function encryptSecret(plaintext: string, aad?: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

function openBlob(encryptedBase64: string, aad?: string): string {
  if (encryptedBase64.startsWith(ENVELOPE_PREFIX)) {
    // Not a tamper and not a wrong key: the blob is in the envelope format,
    // which needs its organisation's data key. Saying so beats a GCM failure.
    throw new Error(
      "This secret is sealed in the envelope (ce2) format; open it with openSecretsForOrg (secret-envelope.ts).",
    );
  }
  const key = getEncryptionKey();
  const buf = Buffer.from(encryptedBase64, "base64");
  if (buf.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) {
    throw new Error("SapConnection secret blob is too short to be valid ciphertext.");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

/**
 * Decrypt a base64(IV + ciphertext + authTag) blob → UTF-8 string. Throws on tamper.
 *
 * When `aad` is supplied and the blob does not open under it, we retry WITHOUT
 * AAD once. That is the migration path: rows sealed before AAD existed still
 * open, so introducing binding does not strand live connections. It does mean an
 * unbound legacy blob is still swappable until it is re-sealed — the fallback is
 * a bridge, not the destination, and re-sealing on next write closes it.
 *
 * Note the fallback CANNOT weaken a blob that WAS sealed with AAD: such a blob
 * fails authentication without its AAD, so a swapped row still throws.
 */
export function decryptSecret(encryptedBase64: string, aad?: string): string {
  if (!aad) return openBlob(encryptedBase64);
  try {
    return openBlob(encryptedBase64, aad);
  } catch {
    return openBlob(encryptedBase64);
  }
}

/**
 * Does a legacy blob open under `aad` itself — without the unbound fallback?
 *
 * For the reseal script, which must tell a bound legacy blob from one sealed
 * before AAD existed: both open through decryptSecret, and only the second is
 * still swappable between rows.
 */
export function isBoundLegacyBlob(encryptedBase64: string, aad: string): boolean {
  try {
    openBlob(encryptedBase64, aad);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decrypt a legacy blob under `aad` ONLY — no unbound fallback. Throws on a
 * blob sealed before AAD existed, as on one sealed for another row.
 *
 * For the envelope (secret-envelope.ts) once the operator has narrowed what
 * legacy blobs open to bound ones (SAP_CONNECTION_ACCEPT_LEGACY_FORMAT=bound).
 */
export function decryptBoundSecret(encryptedBase64: string, aad: string): string {
  return openBlob(encryptedBase64, aad);
}

/** Only the non-empty string fields — what both formats store. */
export function trimSecrets(secrets: SapConnectionSecrets): SapConnectionSecrets {
  const trimmed: SapConnectionSecrets = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === "string" && v.length > 0) trimmed[k as keyof SapConnectionSecrets] = v;
  }
  return trimmed;
}

/** Seal a secrets object into a single storable blob (only defined fields are kept). */
export function sealSecrets(secrets: SapConnectionSecrets, aad?: string): string {
  return encryptSecret(JSON.stringify(trimSecrets(secrets)), aad);
}

/**
 * Open a sealed blob back into a secrets object. Returns {} for an empty/absent blob.
 *
 * THE KEY LIST MUST COVER EVERY FIELD `SapConnectionSecrets` DECLARES. It once
 * omitted `samlAssertion` and `companyId`: `sealSecrets` stored them (it walks
 * Object.entries), and this function silently dropped them on the way out — so
 * a SuccessFactors SAML connection sealed fine and then failed its token
 * exchange with "missing companyId, samlAssertion" no matter what the operator
 * typed. A seal/open round-trip test now pins every field, which is the only
 * durable fix for an allow-list that has to track a type by hand.
 */
export function openSecrets(blob: string | null | undefined, aad?: string): SapConnectionSecrets {
  if (!blob) return {};
  return parseSecrets(decryptSecret(blob, aad));
}

/**
 * The decrypted JSON → a secrets object, through the allow-list below. Shared
 * by both formats, so the envelope path cannot drift from this one.
 */
export function parseSecrets(json: string): SapConnectionSecrets {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object") return {};
  const src = parsed as Record<string, unknown>;
  const out: SapConnectionSecrets = {};
  const KEYS = [
    "username",
    "password",
    "bearerToken",
    "clientId",
    "clientSecret",
    "writeSecret",
    "samlAssertion",
    "companyId",
    "samlPrivateKey",
    "samlUserId",
    "apiKey",
    "apiKeyHeader",
  ] as const satisfies readonly (keyof SapConnectionSecrets)[];
  for (const key of KEYS) {
    if (typeof src[key] === "string") out[key] = src[key] as string;
  }
  return out;
}
