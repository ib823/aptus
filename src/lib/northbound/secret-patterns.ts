/**
 * Secret-scanning patterns for every CoreEdge credential (P0.11).
 *
 * PUBLISHED, NOT PRIVATE. These are the regexes in
 * docs/coreedge/secret-scanning.md, for a team to load into GitHub secret
 * scanning (custom patterns), gitleaks, trufflehog or a log filter. They live
 * in code so a test can prove what the document claims: each pattern matches
 * the keys this codebase actually generates — the `ce_live_` and `ce_test_`
 * keys of P0.11 and the legacy `ce_` keys still in circulation — and nothing
 * in this repository. A scanner that fires on every commit gets switched off,
 * and one that misses the real shape is worse than none.
 *
 * WHY THE SHAPE IS EXACT. Every secret here is a prefix and 32 random bytes in
 * base64url, which is exactly 43 characters from [A-Za-z0-9_-]. The patterns
 * require exactly that, bounded on both sides by a character that cannot be
 * part of a token, so a legacy `ce_` pattern does not fire inside a
 * `ce_live_` key (the 43 characters after `ce_` would be followed by more
 * token characters) and an ordinary identifier such as `ce_test_helper` does
 * not match at all.
 */

/** A character that cannot be part of a base64url token. */
const EDGE_BEFORE = "(?<![A-Za-z0-9_-])";
const EDGE_AFTER = "(?![A-Za-z0-9_-])";
/** 32 random bytes, base64url, unpadded. */
const BODY = "[A-Za-z0-9_-]{43}";

export interface SecretPattern {
  /** Stable id for a scanner rule. */
  readonly id: string;
  readonly name: string;
  /** What a hit means, and what to do about it. */
  readonly severity: "critical" | "high" | "medium";
  readonly remedy: string;
  /**
   * The pattern with lookaround boundaries (PCRE, JavaScript, Python, .NET).
   * Engines without lookaround (RE2: Go, gitleaks; Hyperscan: GitHub) take the
   * body and boundaries separately — docs/coreedge/secret-scanning.md shows how.
   */
  readonly regex: string;
  /** The same pattern without boundaries, for engines that take them separately. */
  readonly body: string;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: "coreedge-live-key",
    name: "CoreEdge PROD runtime key (ce_live_)",
    severity: "critical",
    remedy: "Revoke it in CoreEdge (Operations > Keys, or Studio > API Access): that ends it and any key it replaced at once. Then issue a new one.",
    regex: `${EDGE_BEFORE}ce_live_${BODY}${EDGE_AFTER}`,
    body: `ce_live_${BODY}`,
  },
  {
    id: "coreedge-test-key",
    name: "CoreEdge SANDBOX, DEV or TEST runtime key (ce_test_)",
    severity: "high",
    remedy: "Revoke it, then issue a new one. It cannot reach production data, but TEST may hold copies of it.",
    regex: `${EDGE_BEFORE}ce_test_${BODY}${EDGE_AFTER}`,
    body: `ce_test_${BODY}`,
  },
  {
    id: "coreedge-legacy-key",
    name: "CoreEdge runtime key, issued before key prefixes (ce_)",
    severity: "critical",
    remedy: "Treat as PROD until its lane says otherwise: revoke it, then issue a new one, which will carry ce_live_ or ce_test_.",
    regex: `${EDGE_BEFORE}ce_${BODY}${EDGE_AFTER}`,
    body: `ce_${BODY}`,
  },
  {
    id: "coreedge-write-key",
    name: "CoreEdge write key (cew_)",
    severity: "critical",
    remedy: "Revoke the runtime key it is sealed beside (that destroys the write key), then issue both again.",
    regex: `${EDGE_BEFORE}cew_${BODY}${EDGE_AFTER}`,
    body: `cew_${BODY}`,
  },
  {
    id: "coreedge-claim-link",
    name: "CoreEdge one-time claim link token (cec_)",
    severity: "medium",
    remedy: "If it has not been collected, send a new link: that revokes this one. If it has, nothing is left behind it.",
    regex: `${EDGE_BEFORE}cec_${BODY}${EDGE_AFTER}`,
    body: `cec_${BODY}`,
  },
];

/** The patterns compiled for JavaScript, global so every hit in a text is found. */
export function compileSecretPatterns(): readonly { readonly pattern: SecretPattern; readonly re: RegExp }[] {
  return SECRET_PATTERNS.map((pattern) => ({ pattern, re: new RegExp(pattern.regex, "g") }));
}

/** Every credential-shaped string in a text, with the pattern it matched. */
export function findSecrets(text: string): { readonly id: string; readonly match: string; readonly index: number }[] {
  const hits: { id: string; match: string; index: number }[] = [];
  for (const { pattern, re } of compileSecretPatterns()) {
    for (const m of text.matchAll(re)) hits.push({ id: pattern.id, match: m[0], index: m.index ?? 0 });
  }
  return hits;
}
