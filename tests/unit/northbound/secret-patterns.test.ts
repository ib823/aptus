// @vitest-environment node
/**
 * The published secret-scanning patterns (P0.11) do what the document says.
 *
 * Three claims, each a test: every pattern matches the credentials this
 * codebase really generates — `ce_live_` and `ce_test_` keys, the legacy `ce_`
 * keys still in circulation, write keys and claim tokens — with exactly one
 * pattern per credential; they match nothing else in this repository, so a
 * team that loads them is not drowned in false positives on day one; and the
 * document publishes exactly the patterns the code holds, so the two cannot
 * drift.
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateClaimToken } from "@/lib/northbound/claim-link";
import { generateClientToken } from "@/lib/northbound/issue";
import { LEGACY_TOKEN_PREFIX } from "@/lib/northbound/key-policy";
import { findSecrets, SECRET_PATTERNS } from "@/lib/northbound/secret-patterns";
import { generateWriteCredential } from "@/lib/northbound/write-credential";

const ROOT = path.resolve(__dirname, "../../..");

/** A key as every runtime key was minted before P0.11. */
const legacyKey = () => `${LEGACY_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

/** Exactly one hit, of the expected pattern, covering the whole credential. */
function expectOneHit(text: string, credential: string, id: string): void {
  const hits = findSecrets(text);
  expect(hits, `${credential} in ${JSON.stringify(text)}`).toHaveLength(1);
  expect(hits[0]).toMatchObject({ id, match: credential });
}

describe("the patterns match what this codebase generates", () => {
  // Many samples: base64url bodies contain `_` and `-`, and a pattern that
  // worked for only some bodies would be worse than none.
  const SAMPLES = 200;
  const generators: [string, () => string][] = [
    ["coreedge-live-key", () => generateClientToken("PROD")],
    ["coreedge-test-key", () => generateClientToken("TEST")],
    ["coreedge-test-key", () => generateClientToken("DEV")],
    ["coreedge-legacy-key", legacyKey],
    ["coreedge-write-key", generateWriteCredential],
    ["coreedge-claim-link", generateClaimToken],
  ];

  it.each(generators)("%s: every generated credential, by exactly one pattern", (id, generate) => {
    for (let i = 0; i < SAMPLES; i++) {
      const credential = generate();
      expectOneHit(credential, credential, id);
    }
  });

  it("finds a credential where it leaks: a header, an env file, JSON, a URL, a log line", () => {
    const key = generateClientToken("PROD");
    for (const text of [
      `Authorization: Bearer ${key}`,
      `COREEDGE_TOKEN=${key}\n`,
      JSON.stringify({ token: key }),
      `https://example.test/hook?token=${key}&x=1`,
      `[northbound] calling with "${key}".`,
    ]) {
      expectOneHit(text, key, "coreedge-live-key");
    }
  });

  it("does not fire on near misses: a short body, a long one, an identifier that only starts the same", () => {
    const body = randomBytes(32).toString("base64url");
    for (const text of [
      `ce_live_${body.slice(0, 42)}`,
      `ce_live_${body}A`,
      `xce_live_${body}`,
      "ce_test_helper_function",
      "ce_live_",
      "ce_",
    ]) {
      expect(findSecrets(text), text).toEqual([]);
    }
  });
});

describe("the patterns match nothing else in this repository", () => {
  it("scans every tracked text file and finds no credential-shaped string", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter((f) => f.length > 0);
    expect(files.length, "git ls-files found nothing — the scan would pass vacuously").toBeGreaterThan(1000);

    const hits: string[] = [];
    for (const file of files) {
      let buf: Buffer;
      try {
        buf = readFileSync(path.join(ROOT, file));
      } catch {
        continue; // deleted in the working tree but still in the index
      }
      if (buf.includes(0)) continue; // binary
      for (const hit of findSecrets(buf.toString("utf8"))) hits.push(`${file}: ${hit.id} ${hit.match.slice(0, 12)}…`);
    }
    expect(hits).toEqual([]);
  });
});

describe("the document publishes exactly these patterns", () => {
  const doc = readFileSync(path.join(ROOT, "docs/coreedge/secret-scanning.md"), "utf8");

  it("lists every pattern verbatim, under its id", () => {
    for (const p of SECRET_PATTERNS) {
      expect(doc, p.id).toContain(p.id);
      expect(doc, `${p.id} regex`).toContain(p.regex);
      expect(doc, `${p.id} body, for engines without lookaround`).toContain(p.body);
    }
  });

  it("is referenced from the developer guide", () => {
    const guide = readFileSync(path.join(ROOT, "docs/coreedge-developer-guide.md"), "utf8");
    expect(guide).toContain("docs/coreedge/secret-scanning.md");
  });
});
