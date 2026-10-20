/**
 * Sealing SAP secrets per organisation — the call-site API since P0.10.
 *
 * EVERY SEALED SECRET GOES THROUGH HERE: a SapConnection's secret bundle
 * (passwords, client secrets, bearer tokens, SAML private keys and assertions,
 * API keys) and the write key sealed on a SolutionClient row. The sync helpers
 * in connection-crypto.ts remain the LEGACY codec underneath; nothing outside
 * this module and the key scripts should call them for new work.
 *
 * TWO FORMATS, BOTH OPEN.
 *
 *   legacy  base64(IV + ciphertext + tag), sealed directly under the legacy key
 *           (SAP_CONNECTION_ENCRYPTION_KEY = keyring v1). No version marker.
 *   ce2     `ce2:<dataKeyVersion>:<iv>:<ciphertext+tag>` (base64url fields),
 *           sealed under the organisation's data key `dataKeyVersion`, which is
 *           stored wrapped by the master key (OrgDataKey). Self-describing: the
 *           blob names the data key, the data-key row names its master version
 *           and provider.
 *
 * WHICH ONE A WRITE PRODUCES is an operator decision, not a code default. Until
 * an active master key is named (SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY) — or a
 * KMS provider selected — writes stay legacy, byte for byte as before. That
 * matters for rollback: a deployment rolled back to code older than P0.10
 * cannot read `ce2`, so the switch must be something an operator flips on
 * purpose and can flip back: unset the active key (and any KMS provider) and
 * redeploy FIRST, so nothing new is written as `ce2`, then
 * `pnpm keys:reseal --to legacy --apply`, which refuses to run while envelope
 * sealing is on, then `pnpm keys:verify --expect-format=legacy`.
 *
 * THE ROW BINDING IS UNCHANGED. The caller's AAD (connectionAad,
 * solutionClientRowAad) is authenticated with every `ce2` blob exactly as with
 * a legacy one, prefixed by the blob's own header so the version cannot be
 * edited either. A `ce2` blob has no unbound fallback: it was born bound.
 *
 * WHICH LEGACY BLOBS STILL OPEN is the operator's other switch,
 * SAP_CONNECTION_ACCEPT_LEGACY_FORMAT (keyring.ts, legacyFormatPolicy): `any`
 * by default, as before; `bound` refuses the unbound fallback; `none` refuses
 * the legacy format outright, so a pre-AAD blob from an old backup cannot be
 * written over a migrated row and opened there while `v1` stays configured
 * for a rollback.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import {
  decryptBoundSecret,
  decryptSecret,
  openSecrets,
  parseSecrets,
  sealSecrets,
  trimSecrets,
  type SapConnectionSecrets,
} from "@/lib/sap-public/connection-crypto";
import { envelopeSealingEnabled } from "@/lib/sap-public/keys/key-provider";
import {
  ENV_ACCEPT_LEGACY_FORMAT,
  KeyringConfigError,
  legacyFormatPolicy,
  legacySealingKeyConfigured,
} from "@/lib/sap-public/keys/keyring";
import { dataKeyForOpen, dataKeyForSeal } from "@/lib/sap-public/keys/org-data-key";

export const ENVELOPE_PREFIX = "ce2:";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export type SealedFormat = "legacy" | "ce2";

/** What a stored blob says about itself, without opening it. */
export type SealedBlobDescription =
  | { readonly format: "legacy" }
  | { readonly format: "ce2"; readonly dataKeyVersion: number };

interface ParsedEnvelope {
  readonly dataKeyVersion: number;
  readonly iv: Buffer;
  readonly body: Buffer;
  readonly header: string;
}

/** Is this blob in the envelope format? A legacy blob is base64 and has no `:`. */
export function isEnvelopeBlob(blob: string): boolean {
  return blob.startsWith(ENVELOPE_PREFIX);
}

function parseEnvelope(blob: string): ParsedEnvelope {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "ce2") {
    throw new Error("Sealed secret is not a well-formed ce2 envelope (ce2:<version>:<iv>:<ciphertext>).");
  }
  const [, versionText, ivText, bodyText] = parts as [string, string, string, string];
  if (!/^[1-9][0-9]{0,8}$/.test(versionText)) {
    throw new Error("Sealed secret names a data-key version that is not a positive integer.");
  }
  const iv = Buffer.from(ivText, "base64url");
  const body = Buffer.from(bodyText, "base64url");
  if (iv.length !== IV_LENGTH || body.length < 1 + AUTH_TAG_LENGTH) {
    throw new Error("Sealed secret is too short to be valid ciphertext.");
  }
  return {
    dataKeyVersion: Number(versionText),
    iv,
    body,
    header: `${ENVELOPE_PREFIX}${versionText}:`,
  };
}

/** Which format, and for `ce2` which data key. Throws on a malformed envelope. */
export function describeSealedBlob(blob: string): SealedBlobDescription {
  if (!isEnvelopeBlob(blob)) return { format: "legacy" };
  return { format: "ce2", dataKeyVersion: parseEnvelope(blob).dataKeyVersion };
}

/** The header and the row binding, authenticated together. */
function envelopeAad(header: string, aad: string): Buffer {
  return Buffer.from(`${header}${aad}`, "utf8");
}

/** Encrypt under the organisation's newest data key → a `ce2` blob. */
export async function encryptEnvelope(
  organizationId: string,
  plaintext: string,
  aad: string,
): Promise<string> {
  const { version, key } = await dataKeyForSeal(organizationId);
  const header = `${ENVELOPE_PREFIX}${version}:`;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(envelopeAad(header, aad));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${header}${iv.toString("base64url")}:${body.toString("base64url")}`;
}

function openWithKey(env: ParsedEnvelope, key: Buffer, aad: string): string {
  const decipher = createDecipheriv(ALGORITHM, key, env.iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAAD(envelopeAad(env.header, aad));
  decipher.setAuthTag(env.body.subarray(env.body.length - AUTH_TAG_LENGTH));
  return (
    decipher.update(env.body.subarray(0, env.body.length - AUTH_TAG_LENGTH), undefined, "utf8") +
    decipher.final("utf8")
  );
}

/**
 * Decrypt a `ce2` blob. Throws on tamper, a wrong row, a retired data key, or
 * a data key this database does not hold.
 *
 * The data key may come from the per-process cache, which does not re-read the
 * row. When it fails to open the blob, the row is read once more and, if it
 * now holds a different key (a database restored underneath a warm instance),
 * that key is tried; the same key failing twice is a genuine failure.
 */
export async function decryptEnvelope(
  organizationId: string,
  blob: string,
  aad: string,
): Promise<string> {
  const env = parseEnvelope(blob);
  const key = await dataKeyForOpen(organizationId, env.dataKeyVersion);
  try {
    return openWithKey(env, key, aad);
  } catch (err) {
    const fresh = await dataKeyForOpen(organizationId, env.dataKeyVersion, { refresh: true });
    if (fresh.equals(key)) throw err;
    return openWithKey(env, fresh, aad);
  }
}

/**
 * Open a legacy blob as far as SAP_CONNECTION_ACCEPT_LEGACY_FORMAT allows:
 * with the unbound fallback (`any`), bound only (`bound`), or not at all
 * (`none`). The refusals say which setting refused, never what the blob holds.
 */
function decryptLegacy(blob: string, aad: string): string {
  const policy = legacyFormatPolicy();
  if (policy === "none") {
    throw new Error(
      `This secret is in the legacy format, which ${ENV_ACCEPT_LEGACY_FORMAT}=none refuses. Re-enter the credential, or set the variable to bound or any and run keys:reseal --apply.`,
    );
  }
  if (policy === "any") return decryptSecret(blob, aad);
  try {
    return decryptBoundSecret(blob, aad);
  } catch (err) {
    // A missing or malformed legacy key is a configuration answer; keep it.
    if (!legacySealingKeyConfigured()) throw err;
    throw new Error(
      `This legacy secret does not open under its row's binding (sealed before AAD existed, moved from another row, or under another key), and ${ENV_ACCEPT_LEGACY_FORMAT}=bound refuses the unbound fallback.`,
    );
  }
}

/**
 * Decrypt either format. Legacy blobs keep their unbound fallback (see
 * decryptSecret) unless SAP_CONNECTION_ACCEPT_LEGACY_FORMAT narrows it;
 * `ce2` blobs have none.
 */
export async function decryptForOrg(organizationId: string, blob: string, aad: string): Promise<string> {
  if (isEnvelopeBlob(blob)) return decryptEnvelope(organizationId, blob, aad);
  return decryptLegacy(blob, aad);
}

/** The format the NEXT write produces, as the environment configures it now. */
export function activeSealFormat(): SealedFormat {
  return envelopeSealingEnabled() ? "ce2" : "legacy";
}

/**
 * Seal a secrets bundle for one organisation's row.
 *
 * `ce2` once envelope sealing is switched on; otherwise the legacy
 * `sealSecrets`, untouched — no database read, no new table. A legacy seal
 * is refused while SAP_CONNECTION_ACCEPT_LEGACY_FORMAT=none: the blob could
 * never be opened again.
 */
export async function sealSecretsForOrg(
  organizationId: string,
  secrets: SapConnectionSecrets,
  aad: string,
  format: SealedFormat = activeSealFormat(),
): Promise<string> {
  if (format === "legacy") {
    if (legacyFormatPolicy() === "none") {
      throw new KeyringConfigError(
        `Envelope sealing is off, so this secret would be sealed in the legacy format, which ${ENV_ACCEPT_LEGACY_FORMAT}=none refuses to open. Switch envelope sealing on, or set the variable to bound or any.`,
      );
    }
    return sealSecrets(secrets, aad);
  }
  return encryptEnvelope(organizationId, JSON.stringify(trimSecrets(secrets)), aad);
}

/** Open a sealed bundle of either format. Returns {} for an empty/absent blob. */
export async function openSecretsForOrg(
  organizationId: string,
  blob: string | null | undefined,
  aad: string,
): Promise<SapConnectionSecrets> {
  if (!blob) return {};
  if (isEnvelopeBlob(blob)) return parseSecrets(await decryptEnvelope(organizationId, blob, aad));
  // The default opens a legacy blob exactly as before P0.10.
  if (legacyFormatPolicy() === "any") return openSecrets(blob, aad);
  return parseSecrets(decryptLegacy(blob, aad));
}
