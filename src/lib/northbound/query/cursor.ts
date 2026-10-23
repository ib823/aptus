/**
 * The query surface's paging cursor: sealed, bound and stateless (P1.4, 3.9).
 *
 *   cec1.<kid>.<base64url( iv[12] ‖ ciphertext ‖ tag[16] )>     at most 1,024 characters
 *   cipher  AES-256-GCM, a random 96-bit IV, a 128-bit tag
 *   key     HKDF over the token ring's <kid> key, purpose coreedge/northbound-cursor/v1
 *   AAD     "cec1|" + kid + "|" + organisation + "|" + client + "|" + interface + "|" + API version
 *
 * SEALED, NOT SIGNED. A signed cursor is readable, and what it says — the
 * offset, the rows served, which grants authorised the chain — is the
 * caller's business only as far as paging goes. Sealed, the caller holds an
 * opaque string, and nothing it can change survives authentication.
 *
 * BOUND BY THE AAD, so a cursor opens only for the client, organisation,
 * interface and API version it was issued to. Copied to another client, or
 * replayed in another organisation, it fails to open, and the refusal is the
 * same CURSOR_INVALID a forgery gets: the difference would be an oracle.
 * Everything that can change under a chain is bound in the payload and
 * checked against the live state on every page: the interface version, the
 * compiled policy's rev, the grants (any still live), the connection and its
 * revision, the query itself (queryBind of the re-sent parameters), and two
 * clocks — 15 minutes per cursor, 2 hours per chain.
 *
 * NOTHING SAP SENT IS IN IT. The payload is CoreEdge's counters, ids and
 * hashes; SAP's next link is never stored (response.ts). So a cursor reveals
 * no host even to someone holding the ring.
 *
 * CHEAP TO REFUSE. Length and shape are checked before any base64 is decoded,
 * the kid before any key is derived, and all of it before authorisation: a
 * forged cursor costs no statement.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { queryBind, type QueryAstV1 } from "@/lib/odata/ast";
import { CURSOR_UNUSABLE_MESSAGE } from "@/lib/odata/check";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import type { CompiledQueryPolicyV1 } from "@/lib/odata/policy";
import { queryRefusal, type QueryRefusal } from "@/lib/odata/rules";
import { deriveTokenKey, readTokenRing, TOKEN_PURPOSES, type TokenRing } from "@/lib/security/token-ring";

export const CURSOR_FORMAT = "cec1";
export const MAX_CURSOR_LENGTH = 1024;
/** One cursor's life. */
export const CURSOR_TTL_SECONDS = 15 * 60;
/** A whole paging run's life, from its first page. */
export const CHAIN_TTL_SECONDS = 2 * 60 * 60;
export const MAX_CHAIN_PAGES = 10_000;
export const MAX_CURSOR_GRANTS = 8;

const CURSOR_PATTERN = /^cec1\.(t[0-9]{1,6})\.([A-Za-z0-9_-]{40,1000})$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Who and what a cursor is for: the AAD. */
export interface CursorBinding {
  readonly organizationId: string;
  /** The SolutionClient row's id, which survives a key rotation (P0.11). */
  readonly clientId: string;
  readonly interfaceId: string;
  /** The resolved dated API version, e.g. "2026-10". */
  readonly apiVersion: string;
}

export interface CursorPayloadV1 {
  readonly v: 1;
  /** The chain id: 12 random bytes, base64url (the audit's cursorChainId). */
  readonly ch: string;
  /** The index of the page this cursor fetches (1..10,000). */
  readonly pi: number;
  /** The next $skip. */
  readonly off: number;
  /** Rows served so far in the chain. */
  readonly rs: number;
  /** Interface.version at the chain's start. */
  readonly iv: number;
  /** The compiled policy's rev. */
  readonly pr: string;
  /** queryBind of the canonical AST, base64url. */
  readonly qb: string;
  /** The authorising grants at the chain's start, as grantTag digests: sorted, at most 8. */
  readonly g: readonly string[];
  /** The connection id and revision. */
  readonly cn: string;
  readonly cr: number;
  /** The previous page's last row's key, as lastKeyTag under this cursor's kid. */
  readonly lk: string;
  /** The mean projected bytes per served row so far. */
  readonly rb: number;
  /** Issued and expiry, seconds. */
  readonly iat: number;
  readonly exp: number;
  /** The chain's expiry, seconds. */
  readonly cx: number;
}

export type OpenedCursor = { readonly ok: true; readonly kid: string; readonly payload: CursorPayloadV1 };

const PAYLOAD_KEYS = ["v", "ch", "pi", "off", "rs", "iv", "pr", "qb", "g", "cn", "cr", "lk", "rb", "iat", "exp", "cx"] as const;
const B64URL = (n: number) => new RegExp(`^[A-Za-z0-9_-]{${n}}$`);
const CHAIN_ID = B64URL(16);
const BIND = B64URL(22);
const GRANT_TAG = B64URL(12);
const LAST_KEY = B64URL(11);
const POLICY_REV = /^qp1:[A-Za-z0-9_-]{22}$/;
const CONNECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SECONDS = 253402300799; // 9999-12-31

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** A payload exactly as this module writes it, or null. */
function validPayload(raw: unknown): CursorPayloadV1 | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const keys = Object.keys(p);
  if (keys.length !== PAYLOAD_KEYS.length || !PAYLOAD_KEYS.every((k) => Object.hasOwn(p, k))) return null;
  const g = p.g;
  const grantsOk =
    Array.isArray(g) &&
    g.length >= 1 &&
    g.length <= MAX_CURSOR_GRANTS &&
    g.every((t, i) => typeof t === "string" && GRANT_TAG.test(t) && (i === 0 || (g[i - 1] as string) < t));
  const ok =
    p.v === 1 &&
    typeof p.ch === "string" &&
    CHAIN_ID.test(p.ch) &&
    isInt(p.pi, 1, MAX_CHAIN_PAGES) &&
    isInt(p.off, 0, 200_000) &&
    isInt(p.rs, 0, 100_000) &&
    isInt(p.iv, 0, Number.MAX_SAFE_INTEGER) &&
    typeof p.pr === "string" &&
    POLICY_REV.test(p.pr) &&
    typeof p.qb === "string" &&
    BIND.test(p.qb) &&
    grantsOk &&
    typeof p.cn === "string" &&
    CONNECTION_ID.test(p.cn) &&
    isInt(p.cr, 0, Number.MAX_SAFE_INTEGER) &&
    typeof p.lk === "string" &&
    LAST_KEY.test(p.lk) &&
    isInt(p.rb, 0, 4_000_000) &&
    isInt(p.iat, 0, MAX_SECONDS) &&
    isInt(p.exp, 0, MAX_SECONDS) &&
    isInt(p.cx, 0, MAX_SECONDS);
  return ok ? (p as unknown as CursorPayloadV1) : null;
}

function aad(kid: string, b: CursorBinding): Buffer {
  const parts = [b.organizationId, b.clientId, b.interfaceId, b.apiVersion];
  // A `|` in a component would make two bindings one AAD.
  if (parts.some((x) => x.length === 0 || x.includes("|"))) throw new QueryCompilerInvariantError("A cursor binding component is empty or contains |.");
  return Buffer.from(`${CURSOR_FORMAT}|${kid}|${parts.join("|")}`, "utf8");
}

/** A new chain id: 12 random bytes. */
export function newChainId(): string {
  return randomBytes(12).toString("base64url");
}

/** A grant id as the cursor carries it: a 72-bit digest, so the cursor's length does not depend on the id's format. */
export function grantTag(grantId: string): string {
  return createHash("sha256").update(`coreedge/cursor-grant|${grantId}`, "utf8").digest().subarray(0, 9).toString("base64url");
}

/** The authorising grants as a chain's first cursor records them: digests, sorted, at most 8. */
export function grantTags(grantIds: readonly string[]): string[] {
  return [...new Set(grantIds.map(grantTag))].sort().slice(0, MAX_CURSOR_GRANTS);
}

/** A row's canonical key, keyed under the ring, for the overlap check: 8 bytes, base64url. */
export function lastKeyTag(ring: TokenRing, kid: string, keyText: string): string {
  const key = deriveTokenKey(ring, kid, TOKEN_PURPOSES.cursorLastKey);
  return createHmac("sha256", key).update(keyText, "utf8").digest().subarray(0, 8).toString("base64url");
}

/** The payload, sealed under the ring's active key. Throws on a payload this module would not open. */
export function sealCursor(payload: CursorPayloadV1, binding: CursorBinding, ring: TokenRing = readTokenRing()): string {
  if (validPayload(payload) === null) throw new QueryCompilerInvariantError("A cursor payload failed its own schema.");
  const kid = ring.active;
  const ordered: Record<string, unknown> = {};
  for (const k of PAYLOAD_KEYS) ordered[k] = payload[k];
  const plaintext = Buffer.from(JSON.stringify(ordered), "utf8");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveTokenKey(ring, kid, TOKEN_PURPOSES.cursor), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(kid, binding));
  const sealed = Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const text = `${CURSOR_FORMAT}.${kid}.${sealed.toString("base64url")}`;
  if (text.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(text)) throw new QueryCompilerInvariantError("A sealed cursor is longer than the cursor format allows.");
  return text;
}

const invalid = (auditRule: "CURSOR_MALFORMED" | "CURSOR_KEY_UNKNOWN" | "CURSOR_UNOPENED"): QueryRefusal =>
  queryRefusal("CURSOR_INVALID", "CURSOR_INVALID", CURSOR_UNUSABLE_MESSAGE, { parameter: "cursor", auditRule });

const expired = (auditRule: "CURSOR_EXPIRED" | "CURSOR_CHAIN_EXPIRED"): QueryRefusal =>
  queryRefusal("CURSOR_STALE", "EXPIRED", "This cursor has expired. Start again from the first page without a cursor.", { parameter: "cursor", auditRule });

/**
 * Open a cursor the caller sent, before authorisation and without a
 * statement. Every failure to open is one CURSOR_INVALID; only expiry, which
 * the caller can do nothing about but restart, is told apart (CURSOR_STALE).
 * Never throws on what the caller sent.
 */
export function openCursor(text: unknown, binding: CursorBinding, now: Date, ring: TokenRing = readTokenRing()): OpenedCursor | QueryRefusal {
  if (typeof text !== "string" || text.length > MAX_CURSOR_LENGTH) return invalid("CURSOR_MALFORMED");
  const m = CURSOR_PATTERN.exec(text);
  if (!m) return invalid("CURSOR_MALFORMED");
  const kid = m[1]!;
  const body = m[2]!;
  if (!ring.keys.has(kid)) return invalid("CURSOR_KEY_UNKNOWN");
  const sealed = Buffer.from(body, "base64url");
  // Only the canonical spelling of the bytes: base64url has trailing bits
  // that decode either way, and two texts must not be one cursor.
  if (sealed.toString("base64url") !== body || sealed.length < IV_BYTES + TAG_BYTES + 2) return invalid("CURSOR_MALFORMED");
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveTokenKey(ring, kid, TOKEN_PURPOSES.cursor), sealed.subarray(0, IV_BYTES), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad(kid, binding));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    plaintext = Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()]);
  } catch {
    return invalid("CURSOR_UNOPENED");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext.toString("utf8"));
  } catch {
    return invalid("CURSOR_MALFORMED");
  }
  const payload = validPayload(raw);
  if (payload === null) return invalid("CURSOR_MALFORMED");
  const seconds = Math.floor(now.getTime() / 1000);
  if (seconds >= payload.cx) return expired("CURSOR_CHAIN_EXPIRED");
  if (seconds >= payload.exp) return expired("CURSOR_EXPIRED");
  return { ok: true, kid, payload };
}

const changed = (auditRule: "CURSOR_INTERFACE_CHANGED" | "CURSOR_POLICY_CHANGED" | "CURSOR_GRANT_CHANGED" | "CURSOR_CONNECTION_CHANGED"): QueryRefusal =>
  queryRefusal("CURSOR_STALE", "CHANGED", "The interface, its query policy, its grant or its connection changed since the first page; start again from the first page.", {
    parameter: "cursor",
    auditRule,
  });

/**
 * After authorisation, which re-read the grants: the interface version, the
 * policy and the grants the chain began under. The chain survives while ANY
 * of its grants is still authorising (D7); a revoke and re-approve is a new
 * grant row, so it ends the chain.
 */
export function checkCursorAfterAuthorise(
  payload: CursorPayloadV1,
  live: {
    readonly interfaceVersion: number;
    readonly policy: Pick<CompiledQueryPolicyV1, "rev" | "page">;
    readonly authorisingGrantIds: readonly string[];
  },
): QueryRefusal | null {
  if (payload.iv !== live.interfaceVersion) return changed("CURSOR_INTERFACE_CHANGED");
  if (payload.pr !== live.policy.rev) return changed("CURSOR_POLICY_CHANGED");
  // Cannot fail while the rev matches (no cursor is issued at the cap);
  // checked so a cursor can never ask for more than its policy allows.
  if (payload.rs >= live.policy.page.rowCap || payload.off > live.policy.page.rowCap + live.policy.page.maxSize) {
    return changed("CURSOR_POLICY_CHANGED");
  }
  const liveTags = new Set(live.authorisingGrantIds.map(grantTag));
  if (!payload.g.some((t) => liveTags.has(t))) return changed("CURSOR_GRANT_CHANGED");
  return null;
}

/** The re-sent parameters, checked again, must be the chain's query. */
export function checkCursorQuery(payload: CursorPayloadV1, ast: QueryAstV1): QueryRefusal | null {
  const sealed = Buffer.from(payload.qb, "base64url");
  const now = queryBind(ast);
  if (sealed.length === now.length && timingSafeEqual(sealed, now)) return null;
  return queryRefusal("QUERY_INVALID", "CURSOR_PARAMS_MISMATCH", "Send the same parameters with the cursor as with the first page, and nothing else.", {
    parameter: "cursor",
  });
}

/** After the connection is bound: the same connection, at the same revision. */
export function checkCursorConnection(payload: CursorPayloadV1, connection: { readonly id: string; readonly revision: number }): QueryRefusal | null {
  return payload.cn === connection.id && payload.cr === connection.revision ? null : changed("CURSOR_CONNECTION_CHANGED");
}
