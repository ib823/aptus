/**
 * A SAML 2.0 bearer assertion for SuccessFactors' OAuth token endpoint, signed
 * here with the key from the customer's OAuth client registration.
 *
 * WHY SIGN HERE AT ALL. A pasted, pre-signed assertion expires — SAP's offline
 * generator defaults to ten minutes — and SuccessFactors' own /oauth/idp
 * generator is deprecated. A stored connection that holds one therefore works
 * for minutes and then fails every token exchange until a person pastes a new
 * one. Holding the private key instead lets every exchange carry a fresh,
 * short-lived assertion, which is also the safer shape: nothing long-lived and
 * replayable sits in the database, only the key that SuccessFactors already
 * trusts for this one API key.
 *
 * CANONICAL BY CONSTRUCTION. XML-DSig signs the exclusive canonical form
 * (xml-exc-c14n) of the assertion and of SignedInfo, and a verifier recomputes
 * both from the bytes it receives. Rather than parse XML and canonicalise it —
 * which needs a general XML library and its CVE history — this builds the tree
 * itself and serialises it twice from the same model: once as the document,
 * once under the exclusive-c14n rules (namespace declarations rendered only
 * where visibly used, attributes in canonical order, c14n escaping, no empty-
 * element shorthand). The digest and the signature are computed over the second.
 *
 * VERIFIED INDEPENDENTLY, not by reading this file twice. The tests check every
 * assertion this produces with xmlsec1 — the reference XML-DSig implementation —
 * when it is installed, and pin a deterministic test vector (RSA PKCS#1 v1.5 is
 * deterministic) that xmlsec1 verified, so CI catches any change to the bytes.
 *
 * Node's crypto only. No XML dependency, so nothing new for the audit gate.
 */
import { createHash, createPrivateKey, createSign, randomBytes, type KeyObject } from "node:crypto";

/* ─────────────────────────────────────────────────────────────────────────────
 * What SuccessFactors matches
 * ────────────────────────────────────────────────────────────────────────── */

const SAML_NS = "urn:oasis:names:tc:SAML:2.0:assertion";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

/** Issuer and Audience. SuccessFactors' own IdP and SAP's offline tool use this value for both. */
export const SF_ISSUER = "www.successfactors.com";
export const SF_AUDIENCE = "www.successfactors.com";
const NAMEID_UNSPECIFIED = "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified";
const BEARER = "urn:oasis:names:tc:SAML:2.0:cm:bearer";
const PASSWORD_PROTECTED = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
/** The attribute that carries the API key, as SuccessFactors-issued assertions name it. */
const API_KEY_ATTRIBUTE = "api_key";

/** SAP's offline generator defaults to ten minutes; an assertion here is used within seconds. */
export const DEFAULT_ASSERTION_LIFETIME_MS = 10 * 60 * 1000;
/** NotBefore is set this far in the past so a SuccessFactors clock slightly behind ours still accepts it. */
const CLOCK_SKEW_MS = 60 * 1000;

/* ─────────────────────────────────────────────────────────────────────────────
 * A tree small enough to canonicalise without a parser
 * ────────────────────────────────────────────────────────────────────────── */

interface Attr {
  /** Prefixed attributes (e.g. xsi:type) carry their prefix; SAML's own attributes are unprefixed. */
  readonly prefix?: string;
  readonly name: string;
  readonly value: string;
}

interface El {
  readonly prefix: string;
  readonly name: string;
  /** Namespace declarations made ON this element in the document, prefix → URI. */
  readonly ns?: Readonly<Record<string, string>>;
  readonly attrs?: readonly Attr[];
  readonly children?: readonly (El | string)[];
}

function el(
  prefix: string,
  name: string,
  attrs: readonly Attr[] = [],
  children: readonly (El | string)[] = [],
  ns?: Record<string, string>,
): El {
  return { prefix, name, attrs, children, ...(ns ? { ns } : {}) };
}

const a = (name: string, value: string): Attr => ({ name, value });

/** c14n text escaping: &, <, > and CR. */
function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}

/** c14n attribute escaping: &, <, " and the three whitespace controls. */
function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

/**
 * Serialise exactly as the tree declares it — the document that is sent.
 *
 * Attribute order here is the canonical one too (see `canonical`), so for this
 * tree the two forms differ only in WHERE namespace declarations appear.
 */
function serialize(e: El): string {
  const nsAttrs = Object.entries(e.ns ?? {})
    .sort(([p1], [p2]) => (p1 < p2 ? -1 : p1 > p2 ? 1 : 0))
    .map(([p, uri]) => ` ${p ? `xmlns:${p}` : "xmlns"}="${escAttr(uri)}"`)
    .join("");
  const attrs = sortedAttrs(e.attrs ?? [], (p) => p)
    .map((x) => ` ${x.prefix ? `${x.prefix}:` : ""}${x.name}="${escAttr(x.value)}"`)
    .join("");
  const q = e.prefix ? `${e.prefix}:${e.name}` : e.name;
  const body = (e.children ?? []).map((c) => (typeof c === "string" ? escText(c) : serialize(c))).join("");
  return `<${q}${nsAttrs}${attrs}>${body}</${q}>`;
}

/**
 * Canonical attribute order: unprefixed (no-namespace) attributes first by
 * local name, then namespaced ones by (namespace URI, local name).
 */
function sortedAttrs(attrs: readonly Attr[], uriOf: (prefix: string) => string): Attr[] {
  const key = (x: Attr) => [x.prefix ? uriOf(x.prefix) : "", x.name] as const;
  return [...attrs].sort((x, y) => {
    const [u1, n1] = key(x);
    const [u2, n2] = key(y);
    if (u1 !== u2) return u1 < u2 ? -1 : 1;
    return n1 < n2 ? -1 : n1 > n2 ? 1 : 0;
  });
}

/**
 * Exclusive XML canonicalisation (without comments) of the subtree at `e`.
 *
 * `inScope` is every namespace declared on `e`'s ancestors in the DOCUMENT —
 * needed because a subtree is canonicalised in its document context (SignedInfo
 * sits inside Signature, which declares ds). `rendered` is what output
 * ancestors have already emitted; the exclusive rule renders a declaration
 * only on an element that visibly utilises the prefix (its own name or one of
 * its attributes) and only when no output ancestor already rendered the same
 * binding.
 */
function canonical(
  e: El,
  inScope: Readonly<Record<string, string>> = {},
  rendered: Readonly<Record<string, string>> = {},
): string {
  const scope = { ...inScope, ...(e.ns ?? {}) };
  const uriOf = (p: string) => {
    const uri = scope[p];
    if (uri === undefined) throw new Error(`namespace prefix "${p}" is not declared`);
    return uri;
  };

  const utilized = new Set<string>([e.prefix]);
  for (const x of e.attrs ?? []) if (x.prefix) utilized.add(x.prefix);

  const toRender: [string, string][] = [];
  for (const p of utilized) {
    const uri = p ? uriOf(p) : (scope[""] ?? "");
    if (rendered[p] !== uri && !(p === "" && uri === "" && rendered[""] === undefined)) {
      toRender.push([p, uri]);
    }
  }
  toRender.sort(([p1], [p2]) => (p1 < p2 ? -1 : p1 > p2 ? 1 : 0));
  const nextRendered = { ...rendered, ...Object.fromEntries(toRender) };

  const nsAttrs = toRender.map(([p, uri]) => ` ${p ? `xmlns:${p}` : "xmlns"}="${escAttr(uri)}"`).join("");
  const attrs = sortedAttrs(e.attrs ?? [], uriOf)
    .map((x) => ` ${x.prefix ? `${x.prefix}:` : ""}${x.name}="${escAttr(x.value)}"`)
    .join("");
  const q = e.prefix ? `${e.prefix}:${e.name}` : e.name;
  const body = (e.children ?? [])
    .map((c) => (typeof c === "string" ? escText(c) : canonical(c, scope, nextRendered)))
    .join("");
  return `<${q}${nsAttrs}${attrs}>${body}</${q}>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The private key
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A key that cannot be used, said without echoing any of it.
 *
 * Carries a bounded `code`, like the URL guard, so an audit row names the
 * refusal rather than a generic failure.
 */
export class SamlKeyError extends Error {
  readonly code = "SAML_PRIVATE_KEY_UNUSABLE";
  constructor(reason: string) {
    super(`The SuccessFactors signing key cannot be used: ${reason}`);
    this.name = "SamlKeyError";
  }
}

const PEM_KEY_BLOCK =
  /-----BEGIN (RSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (RSA |ENCRYPTED )?PRIVATE KEY-----/;

/**
 * Accept the key in the shapes an administrator will actually have.
 *
 * - PEM, PKCS#8 (`BEGIN PRIVATE KEY`) or PKCS#1 (`BEGIN RSA PRIVATE KEY`) —
 *   including a file that also carries the certificate, from which the key
 *   block is taken;
 * - headerless base64 PKCS#8, which is what SAP's offline tool's `privateKey`
 *   property takes, with PKCS#1 tried second.
 *
 * Refused: an encrypted key (there is nowhere to keep its passphrase that is
 * better than keeping the key unencrypted under the connection seal), and any
 * key that is not RSA of at least 2048 bits — SuccessFactors' registration
 * issues RSA, and RSA-SHA256 is what this signs with.
 */
export function parseSamlPrivateKey(raw: string): KeyObject {
  const text = raw.trim();
  if (!text) throw new SamlKeyError("no key was supplied.");

  let key: KeyObject;
  const pem = PEM_KEY_BLOCK.exec(text);
  if (pem) {
    if (pem[1] === "ENCRYPTED ") {
      throw new SamlKeyError("it is passphrase-encrypted. Supply the unencrypted private key.");
    }
    try {
      key = createPrivateKey({ key: pem[0], format: "pem" });
    } catch {
      throw new SamlKeyError("the PEM block is not a readable private key.");
    }
  } else if (text.includes("-----BEGIN")) {
    throw new SamlKeyError("the PEM text contains no private key block (a certificate alone is not enough).");
  } else {
    const der = Buffer.from(text.replace(/\s+/g, ""), "base64");
    const attempt = (type: "pkcs8" | "pkcs1"): KeyObject | null => {
      try {
        return createPrivateKey({ key: der, format: "der", type });
      } catch {
        return null;
      }
    };
    const parsed = der.length > 0 ? (attempt("pkcs8") ?? attempt("pkcs1")) : null;
    if (!parsed) throw new SamlKeyError("it is neither PEM nor base64-encoded PKCS#8 / PKCS#1.");
    key = parsed;
  }

  if (key.asymmetricKeyType !== "rsa") {
    throw new SamlKeyError(`it is ${key.asymmetricKeyType ?? "an unknown"} key; SuccessFactors signs with RSA.`);
  }
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < 2048) throw new SamlKeyError(`it is ${bits}-bit RSA; at least 2048 bits is required.`);
  return key;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The assertion
 * ────────────────────────────────────────────────────────────────────────── */

export interface SamlAssertionInput {
  /** The SuccessFactors API key — the OAuth client id. */
  readonly clientId: string;
  /** The SuccessFactors user the token is issued for. */
  readonly userId: string;
  /** The token endpoint, e.g. https://apiNN.successfactors.com/oauth/token — the Recipient. */
  readonly tokenUrl: string;
  /** A KeyObject from `parseSamlPrivateKey`, or the raw key text. */
  readonly privateKey: KeyObject | string;
  /** Overrides for tests: the clock, the lifetime and the assertion ID. */
  readonly now?: Date;
  readonly lifetimeMs?: number;
  readonly id?: string;
}

/** xs:dateTime in UTC, to the second — the form SAML assertions conventionally carry. */
function samlTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** An NCName: SAML IDs may not start with a digit. */
function newAssertionId(): string {
  return `_${randomBytes(16).toString("hex")}`;
}

function assertionTree(input: SamlAssertionInput, id: string, signature: El | null): El {
  const now = (input.now ?? new Date()).getTime();
  const issueInstant = samlTime(now);
  const notBefore = samlTime(now - CLOCK_SKEW_MS);
  const notOnOrAfter = samlTime(now + (input.lifetimeMs ?? DEFAULT_ASSERTION_LIFETIME_MS));

  const issuer = el("saml2", "Issuer", [], [SF_ISSUER]);
  return el(
    "saml2",
    "Assertion",
    [a("ID", id), a("IssueInstant", issueInstant), a("Version", "2.0")],
    [
      issuer,
      // The schema puts the enveloped Signature immediately after Issuer.
      ...(signature ? [signature] : []),
      el("saml2", "Subject", [], [
        el("saml2", "NameID", [a("Format", NAMEID_UNSPECIFIED)], [input.userId]),
        el("saml2", "SubjectConfirmation", [a("Method", BEARER)], [
          el("saml2", "SubjectConfirmationData", [
            a("NotOnOrAfter", notOnOrAfter),
            a("Recipient", input.tokenUrl),
          ]),
        ]),
      ]),
      el("saml2", "Conditions", [a("NotBefore", notBefore), a("NotOnOrAfter", notOnOrAfter)], [
        el("saml2", "AudienceRestriction", [], [el("saml2", "Audience", [], [SF_AUDIENCE])]),
      ]),
      el("saml2", "AuthnStatement", [a("AuthnInstant", issueInstant), a("SessionIndex", id)], [
        el("saml2", "AuthnContext", [], [el("saml2", "AuthnContextClassRef", [], [PASSWORD_PROTECTED])]),
      ]),
      el("saml2", "AttributeStatement", [], [
        el("saml2", "Attribute", [a("Name", API_KEY_ATTRIBUTE)], [
          el("saml2", "AttributeValue", [], [input.clientId]),
        ]),
      ]),
    ],
    { saml2: SAML_NS },
  );
}

function signedInfoTree(id: string, digest: string): El {
  return el("ds", "SignedInfo", [], [
    el("ds", "CanonicalizationMethod", [a("Algorithm", EXC_C14N)]),
    el("ds", "SignatureMethod", [a("Algorithm", RSA_SHA256)]),
    el("ds", "Reference", [a("URI", `#${id}`)], [
      el("ds", "Transforms", [], [
        el("ds", "Transform", [a("Algorithm", ENVELOPED)]),
        el("ds", "Transform", [a("Algorithm", EXC_C14N)]),
      ]),
      el("ds", "DigestMethod", [a("Algorithm", SHA256)]),
      el("ds", "DigestValue", [], [digest]),
    ]),
  ]);
}

/**
 * The signed assertion as XML. Exported for tests and for the verification
 * step; callers that send it want `buildSignedSamlAssertion`.
 */
export function buildSignedSamlAssertionXml(input: SamlAssertionInput): string {
  for (const [field, value] of [
    ["clientId", input.clientId],
    ["userId", input.userId],
    ["tokenUrl", input.tokenUrl],
  ] as const) {
    if (!value || !value.trim()) throw new Error(`A SuccessFactors assertion needs ${field}.`);
  }
  const key = typeof input.privateKey === "string" ? parseSamlPrivateKey(input.privateKey) : input.privateKey;
  const id = input.id ?? newAssertionId();

  // 1 · Digest the assertion WITHOUT its signature: the enveloped-signature
  //     transform removes it before the verifier canonicalises.
  const unsigned = assertionTree(input, id, null);
  const digest = createHash("sha256").update(canonical(unsigned), "utf8").digest("base64");

  // 2 · Sign SignedInfo in its document context: inside Signature, which
  //     declares ds, inside Assertion, which declares saml2 (not rendered —
  //     SignedInfo does not use it).
  const signedInfo = signedInfoTree(id, digest);
  const signedInfoC14n = canonical(signedInfo, { saml2: SAML_NS, ds: DSIG_NS });
  const signatureValue = createSign("RSA-SHA256").update(signedInfoC14n, "utf8").sign(key, "base64");

  const signature = el(
    "ds",
    "Signature",
    [],
    [signedInfo, el("ds", "SignatureValue", [], [signatureValue])],
    { ds: DSIG_NS },
  );
  return serialize(assertionTree(input, id, signature));
}

/** The base64 assertion the token endpoint's `assertion` parameter takes. */
export function buildSignedSamlAssertion(input: SamlAssertionInput): string {
  return Buffer.from(buildSignedSamlAssertionXml(input), "utf8").toString("base64");
}

/** Exposed for tests: the exclusive canonical form of the unsigned assertion. */
export function canonicalUnsignedAssertionForTest(input: SamlAssertionInput, id: string): string {
  return canonical(assertionTree(input, id, null));
}
