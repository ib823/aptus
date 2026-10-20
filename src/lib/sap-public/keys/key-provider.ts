/**
 * KeyProvider — the seam between CoreEdge and whoever holds the master key.
 *
 * ENVELOPE ENCRYPTION IN ONE PARAGRAPH. A secret is sealed under a DATA key
 * that belongs to one organisation (org-data-key.ts). The data key is stored
 * only in WRAPPED form — encrypted under a MASTER key — and the master key is
 * held by a KeyProvider. So the question "who can decrypt this customer's SAP
 * password" has one answer: whoever can ask the provider to unwrap that
 * organisation's data key. Rotating the master key means re-wrapping one small
 * row per organisation, not re-encrypting every secret.
 *
 * THE ENV PROVIDER is the one that ships. It holds the versioned ring from
 * keyring.ts in process memory and wraps with AES-256-GCM. It is the honest
 * successor to the single raw key: versioned, rotatable, but still a key in the
 * environment.
 *
 * A CLOUD KMS PLUGS IN HERE, and nowhere else. No cloud SDK is a dependency —
 * which KMS hosted production uses is an open product decision — so the seam
 * is `registerKeyProvider(name, factory)` plus `SAP_CONNECTION_KEY_PROVIDER`.
 * An adapter implements `wrapDataKey` / `unwrapDataKey` with the KMS's own
 * Encrypt / Decrypt (AWS KMS, GCP Cloud KMS) or WrapKey / UnwrapKey (Azure Key
 * Vault), passing `wrapContext(...)` as the encryption context / AAD. The
 * runbook (docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md) walks through
 * each one.
 *
 * SIGN / VERIFY / JWKS are declared now because P1.4 cursors, P2.5 tokens and
 * P3.10 anchors will need them from the same custody, and an interface that
 * grows a method later forces every adapter to change at once. They are not
 * implemented: the env provider refuses them with KeyOperationUnsupportedError
 * rather than signing with a key nobody has decided should sign.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import {
  ENV_ACTIVE_KEY,
  ENV_KEYRING,
  KeyringConfigError,
  envelopeSealingRequested,
  readKeyring,
} from "./keyring";

export const ENV_KEY_PROVIDER = "SAP_CONNECTION_KEY_PROVIDER";
export const DEFAULT_KEY_PROVIDER = "env";

/** What a data key is bound to when it is wrapped — and must match to unwrap. */
export interface WrapContext {
  readonly organizationId: string;
  /** The data-key version (generation) inside that organisation. */
  readonly dataKeyVersion: number;
}

/** A wrapped data key as it is stored: the master version that wrapped it, and the bytes. */
export interface WrappedDataKey {
  /** The provider's name for the master key version, e.g. "v2" or a KMS key-version id. */
  readonly keyVersion: string;
  /** Opaque to everything but the provider that produced it. */
  readonly wrappedKey: string;
}

/** A JSON Web Key as a JWKS publishes it. Shape only; nothing publishes one yet. */
export type PublicJwk = Readonly<Record<string, string>>;

export interface KeyProvider {
  /** Stored on every OrgDataKey row, so a row says which provider can unwrap it. */
  readonly name: string;
  /** Can this provider wrap a NEW data key right now? Non-throwing. */
  isConfigured(): boolean;
  /** The master key version new data keys are wrapped under. Throws when not configured. */
  activeKeyVersion(): string;
  /** Can this provider unwrap a key wrapped under `keyVersion`? Non-throwing. */
  hasKeyVersion(keyVersion: string): boolean;
  /** Wrap under the ACTIVE master version, bound to `context`. */
  wrapDataKey(dataKey: Buffer, context: WrapContext): Promise<WrappedDataKey>;
  /** Unwrap; throws when the version is gone, the bytes were altered or the context differs. */
  unwrapDataKey(wrapped: WrappedDataKey, context: WrapContext): Promise<Buffer>;
  /** Reserved for P1.4 / P2.5 / P3.10. Not implemented by the env provider. */
  sign(keyId: string, payload: Buffer): Promise<Buffer>;
  verify(keyId: string, payload: Buffer, signature: Buffer): Promise<boolean>;
  publicJwks(): Promise<readonly PublicJwk[]>;
}

/** A provider asked for an operation it does not offer. */
export class KeyOperationUnsupportedError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `The ${provider} key provider does not implement ${operation}. Signing keys arrive with the work that needs them (P1.4, P2.5, P3.10).`,
    );
    this.name = "KeyOperationUnsupportedError";
  }
}

/**
 * The AAD a data key is wrapped under. A wrapped key copied onto another
 * organisation's row — or onto another version slot of the same organisation —
 * does not unwrap there. KMS adapters pass the same string (or its fields) as
 * their encryption context.
 */
export function wrapContext(context: WrapContext): string {
  return `orgdk:v1:${context.organizationId}:${context.dataKeyVersion}`;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * The environment-backed provider: the keyring in process memory.
 *
 * Wrapped format: base64(IV(12) + ciphertext(32) + authTag(16)) — the same
 * layout as every other GCM blob in this codebase.
 */
export function envKeyProvider(env: Readonly<Record<string, string | undefined>> = process.env): KeyProvider {
  const masterKey = (version: string): Buffer => {
    const key = readKeyring(env).keys.get(version);
    if (!key) {
      throw new KeyringConfigError(
        `Master key ${version} is not in ${ENV_KEYRING}. A data key wrapped under it cannot be opened until it is restored there.`,
      );
    }
    return key;
  };

  const activeKeyVersion = (): string => {
    const { active } = readKeyring(env);
    if (!active) {
      throw new KeyringConfigError(
        `${ENV_ACTIVE_KEY} is not set, so there is no master key to wrap a new data key under.`,
      );
    }
    return active;
  };

  return {
    name: DEFAULT_KEY_PROVIDER,

    isConfigured() {
      try {
        return readKeyring(env).active !== null;
      } catch {
        return false;
      }
    },

    activeKeyVersion,

    hasKeyVersion(keyVersion) {
      try {
        return readKeyring(env).keys.has(keyVersion);
      } catch {
        return false;
      }
    },

    async wrapDataKey(dataKey, context) {
      const keyVersion = activeKeyVersion();
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, masterKey(keyVersion), iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      cipher.setAAD(Buffer.from(wrapContext(context), "utf8"));
      const body = Buffer.concat([cipher.update(dataKey), cipher.final()]);
      return {
        keyVersion,
        wrappedKey: Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64"),
      };
    },

    async unwrapDataKey(wrapped, context) {
      const buf = Buffer.from(wrapped.wrappedKey, "base64");
      if (buf.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) {
        throw new Error("Wrapped data key is too short to be valid ciphertext.");
      }
      const decipher = createDecipheriv(ALGORITHM, masterKey(wrapped.keyVersion), buf.subarray(0, IV_LENGTH), {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAAD(Buffer.from(wrapContext(context), "utf8"));
      decipher.setAuthTag(buf.subarray(buf.length - AUTH_TAG_LENGTH));
      return Buffer.concat([
        decipher.update(buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH)),
        decipher.final(),
      ]);
    },

    async sign() {
      throw new KeyOperationUnsupportedError(DEFAULT_KEY_PROVIDER, "sign");
    },
    async verify() {
      throw new KeyOperationUnsupportedError(DEFAULT_KEY_PROVIDER, "verify");
    },
    async publicJwks() {
      throw new KeyOperationUnsupportedError(DEFAULT_KEY_PROVIDER, "publicJwks");
    },
  };
}

/* ── the registry: where a cloud KMS adapter is plugged in ─────────────────── */

type KeyProviderFactory = () => KeyProvider;

// Built-in providers. A cloud KMS adapter is added here — see the runbook,
// "Plugging in a cloud KMS".
const BUILT_IN: ReadonlyArray<readonly [string, KeyProviderFactory]> = [
  [DEFAULT_KEY_PROVIDER, () => envKeyProvider()],
];
const factories = new Map<string, KeyProviderFactory>(BUILT_IN);

/**
 * Make a provider selectable by name; `SAP_CONNECTION_KEY_PROVIDER=<name>`
 * then selects it for NEW data keys. Rows wrapped by another provider keep
 * naming it, so both must stay registered until `pnpm keys:rotate` has moved
 * them.
 *
 * A KMS adapter that ships in this repository belongs in the BUILT_IN list
 * above instead, so the application and scripts/ce-keys.ts always see the same
 * providers: a rotation run from the CLI must unwrap what the app wrapped.
 */
export function registerKeyProvider(name: string, factory: KeyProviderFactory): void {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) {
    throw new Error(`Key provider name "${name}" must be lowercase letters, digits and dashes.`);
  }
  factories.set(name, factory);
}

/** For tests: back to the built-in providers only. */
export function resetKeyProviders(): void {
  factories.clear();
  for (const [name, factory] of BUILT_IN) factories.set(name, factory);
}

/** The configured provider's name. Unset or blank is the env provider. */
export function activeKeyProviderName(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const raw = env[ENV_KEY_PROVIDER]?.trim();
  return raw ? raw : DEFAULT_KEY_PROVIDER;
}

/**
 * A provider by name — the configured one when no name is given. Throws for a
 * name nothing registered, because silently falling back to the env provider
 * would wrap a customer's keys somewhere the operator did not choose.
 */
export function getKeyProvider(name?: string): KeyProvider {
  const wanted = name ?? activeKeyProviderName();
  const factory = factories.get(wanted);
  if (!factory) {
    throw new KeyringConfigError(
      `Key provider "${wanted}" is not registered. Registered: ${[...factories.keys()].join(", ")}.`,
    );
  }
  return factory();
}

/**
 * Do new writes use the envelope (`ce2`) format?
 *
 * Yes when an active master key is named, or a non-env provider is selected —
 * both explicit operator settings. No otherwise, and "no" is the behaviour of
 * every deployment before P0.10: same key, same format, no new table touched.
 */
export function envelopeSealingEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return envelopeSealingRequested(env) || activeKeyProviderName(env) !== DEFAULT_KEY_PROVIDER;
}
