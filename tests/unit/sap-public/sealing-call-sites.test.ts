// @vitest-environment node
/**
 * Every sealing call site goes through the per-organisation API (P0.10).
 *
 * The legacy codec in connection-crypto.ts (sealSecrets / openSecrets /
 * encryptSecret / decryptSecret) can only write the unversioned format and
 * cannot open `ce2` at all. A new call site that reached for it directly would
 * keep writing legacy blobs after an operator switched envelope sealing on —
 * and fail on every row once the reseal had run. So the legacy codec is used by
 * exactly three modules: itself, the envelope that wraps it, and the key
 * maintenance library. Everything else uses sealSecretsForOrg /
 * openSecretsForOrg.
 *
 * The inventory this pins, as of P0.10:
 *   - connection-resolver.ts — SapConnection secret bundles (passwords, client
 *     secrets, bearer tokens, SAML private keys and assertions, API keys)
 *   - northbound/write-credential.ts — the write key on SolutionClient rows
 * BYOAI provider keys (intelligence/ai-key-crypto.ts) are a separate helper and
 * key, and out of this envelope's scope.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";

const ROOT = path.resolve(__dirname, "../../..");

const LEGACY_CODEC = /\b(sealSecrets|openSecrets|encryptSecret|decryptSecret)\b/;
const ALLOWED = new Set([
  "src/lib/sap-public/connection-crypto.ts",
  "src/lib/sap-public/secret-envelope.ts",
  "src/lib/sap-public/keys/maintenance.ts",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sources = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts"))]
  .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))
  .map((f) => ({
    rel: path.relative(ROOT, f).split(path.sep).join("/"),
    // Strings too: an error message may name a helper without calling it.
    code: stripSource(readFileSync(f, "utf8"), "comments-and-strings"),
  }));

describe("sealing call sites", () => {
  it("only the envelope and the key scripts touch the legacy codec", () => {
    const offenders = sources.filter((s) => !ALLOWED.has(s.rel) && LEGACY_CODEC.test(s.code)).map((s) => s.rel);
    expect(offenders, "Seal and open through sealSecretsForOrg / openSecretsForOrg").toEqual([]);
  });

  it("the known call sites use the per-organisation API", () => {
    const users = sources
      .filter((s) => /\b(sealSecretsForOrg|openSecretsForOrg)\b/.test(s.code))
      .map((s) => s.rel)
      .filter((rel) => rel !== "src/lib/sap-public/secret-envelope.ts")
      .sort();
    expect(users).toEqual([
      "src/lib/northbound/write-credential.ts",
      "src/lib/sap-public/connection-resolver.ts",
    ]);
  });

  it("the scan reads code, not comments (guard against a dead guard)", () => {
    // connection-resolver mentions the legacy helpers nowhere in code, but the
    // detector must still see a real reference when one is there.
    expect(LEGACY_CODEC.test(stripSource("const x = sealSecrets(s, aad);"))).toBe(true);
    expect(LEGACY_CODEC.test(stripSource("// sealSecrets(s, aad) used to be here"))).toBe(false);
  });
});
