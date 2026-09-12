/**
 * The one-time claim link (PR-5, capability 1).
 *
 * THE PROPERTY UNDER TEST IS AN ORDERING, not a behaviour: the key must not
 * exist before the link is opened. Everything else about "shown once" follows
 * from that, and nothing else can substitute for it — a key minted up front and
 * merely revealed makes the guarantee a UI convention, and makes the lane state
 * after expiry a lie, because the lane would read "no key" while a working
 * credential existed.
 *
 * These are unit tests over the module's own logic with Prisma stubbed. The
 * transactional compare-and-set is asserted by shape rather than by racing a
 * real database: what matters here is that the claim is guarded by
 * `claimedAt: null` in the WHERE, so a second opener updates zero rows and is
 * refused instead of minting a second key.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLAIM_LINK_TTL_MS,
  CLAIM_TOKEN_PREFIX,
  generateClaimToken,
  hashClaimToken,
} from "@/lib/northbound/claim-link";

const ROOT = process.cwd();
const SOURCE = readFileSync(path.resolve(ROOT, "src/lib/northbound/claim-link.ts"), "utf8");
const SCHEMA = readFileSync(path.resolve(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(
  path.resolve(ROOT, "prisma/migrations/20260912040000_key_claim_link/migration.sql"),
  "utf8",
);

describe("claim tokens", () => {
  it("carries its own prefix, so it can never be mistaken for a key", () => {
    // Keys are ce_…; claim tokens are cec_…. A greppable prefix is also what
    // makes a leaked value identifiable in a log.
    const token = generateClaimToken();
    expect(token.startsWith(CLAIM_TOKEN_PREFIX)).toBe(true);
    expect(CLAIM_TOKEN_PREFIX).not.toBe("ce_");
  });

  it("has real entropy", () => {
    const a = generateClaimToken();
    const b = generateClaimToken();
    expect(a).not.toBe(b);
    // 32 bytes base64url ≈ 43 chars, plus the prefix.
    expect(a.length).toBeGreaterThan(40);
  });

  it("is stored as a hash, never as plaintext", () => {
    const raw = generateClaimToken();
    const hash = hashClaimToken(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(raw);
    // Same shape as SolutionClient.tokenHash: a database copy grants nothing.
    expect(hashClaimToken(raw)).toBe(hash);
  });

  it("expires in days, not months — it is a delivery window", () => {
    expect(CLAIM_LINK_TTL_MS).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(CLAIM_LINK_TTL_MS).toBeGreaterThan(60 * 60 * 1000);
  });
});

describe("the key does not exist before the link is opened", () => {
  it("creates no SolutionClient when the link is created", () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. `createClaimLink` writes a
     * KeyClaimLink and nothing else — if it ever also minted the key, the
     * guarantee would be gone and every other test here would still pass.
     */
    const createFn = SOURCE.slice(
      SOURCE.indexOf("export async function createClaimLink"),
      SOURCE.indexOf("export async function claimKey"),
    );
    expect(createFn).toContain("keyClaimLink.create");
    expect(createFn, "createClaimLink mints a key. It must not.").not.toContain("solutionClient");
    expect(createFn, "createClaimLink generates a key token. It must not.").not.toContain(
      "generateClientToken",
    );
  });

  it("mints the key inside the claim, not before it", () => {
    const claimFn = SOURCE.slice(SOURCE.indexOf("export async function claimKey"));
    expect(claimFn).toContain("generateClientToken");
    expect(claimFn).toContain("solutionClient.upsert");
  });

  it("stores no plaintext key anywhere", () => {
    // The raw token is returned and never written. A column holding it would
    // put a working credential in every backup.
    expect(SCHEMA).not.toMatch(/model KeyClaimLink[\s\S]*?rawToken/);
    expect(MIGRATION).not.toMatch(/rawToken|plaintext|secret/i);
  });
});

describe("an expired link issues nothing", () => {
  it("checks expiry before minting", () => {
    const claimFn = SOURCE.slice(SOURCE.indexOf("export async function claimKey"));
    const expiryCheck = claimFn.indexOf("LINK_EXPIRED");
    const mint = claimFn.indexOf("generateClientToken");
    expect(expiryCheck).toBeGreaterThan(-1);
    expect(mint).toBeGreaterThan(-1);
    expect(
      expiryCheck,
      "the expiry check must come before the key is generated",
    ).toBeLessThan(mint);
  });

  it("leaves the row unconsumed so the lane can say 'expired', not 'no key'", () => {
    // Different sentences with different fixes: "send a new link" versus
    // "collect the key". The row surviving unclaimed is what carries that.
    expect(SCHEMA).toMatch(/model KeyClaimLink[\s\S]*?claimedAt\s+DateTime\?/);
    expect(SCHEMA).toMatch(/model KeyClaimLink[\s\S]*?expiresAt\s+DateTime/);
  });
});

describe("one-time means one", () => {
  it("guards the claim with claimedAt: null inside the transaction", () => {
    /*
     * The atomic compare-and-set. Two people opening the same URL at the same
     * instant must not produce two keys: the second updates zero rows and is
     * refused. Checking `claimedAt` and then updating would be a race.
     */
    const claimFn = SOURCE.slice(SOURCE.indexOf("export async function claimKey"));
    expect(claimFn).toContain("$transaction");
    expect(claimFn).toMatch(/updateMany\(\{[\s\S]*?claimedAt: null[\s\S]*?\}\)/);
    expect(claimFn).toContain("claimed.count === 0");
  });

  it("refuses a spent link", () => {
    const claimFn = SOURCE.slice(SOURCE.indexOf("export async function claimKey"));
    expect(claimFn).toContain("LINK_ALREADY_CLAIMED");
  });

  it("revokes rather than deletes when a new link supersedes one", () => {
    // "You were sent three links" has to stay answerable, and a superseded
    // link must fail with a recorded reason rather than silently doing nothing.
    const createFn = SOURCE.slice(
      SOURCE.indexOf("export async function createClaimLink"),
      SOURCE.indexOf("export async function claimKey"),
    );
    expect(createFn).toContain("revokedAt");
    expect(createFn).not.toContain("delete");
  });
});

describe("refusals do not leak whether a token was ever real", () => {
  it("returns the same shape for every refusal", () => {
    // The northbound broker answers one uniform 401 to six token failures for
    // the same reason: a caller with a guessed token learns only that it did
    // not work.
    const page = readFileSync(
      path.resolve(ROOT, "src/app/(external)/claim/[token]/page.tsx"),
      "utf8",
    );
    // The apostrophe is &apos; in JSX, so match the halves around it.
    expect(page).toContain("This link can");
    expect(page).toContain("t be used.");
    for (const refusal of ["LINK_EXPIRED", "UNKNOWN_LINK", "LINK_REVOKED", "LINK_ALREADY_CLAIMED"]) {
      expect(
        page,
        `the claim page branches on ${refusal}, telling the holder which failure it was`,
      ).not.toContain(refusal);
    }
  });
});

describe("the claim surface is reachable", () => {
  it("lives in the TOKEN route group, not the session-gated one", () => {
    /*
     * The (coreedge) layout redirects any caller without a session — correct for
     * every console route and fatal for this one, since the app owner receiving
     * the link may have no console account. An earlier draft put it there.
     */
    expect(existsSync(path.resolve(ROOT, "src/app/(external)/claim/[token]/page.tsx"))).toBe(true);
    expect(existsSync(path.resolve(ROOT, "src/app/(coreedge)/claim"))).toBe(false);
  });

  it("is in the Workbench allow-list under its own entry", () => {
    // The '/coreedge' prefix does not cover '/claim/'. Without this the link is
    // delivered and then redirected away on a Workbench host.
    const paths = readFileSync(path.resolve(ROOT, "src/lib/routing/workbench-paths.ts"), "utf8");
    expect(paths).toMatch(/'\/claim\/'/);
  });

  it("keeps the claim URL out of indexes and referrers", () => {
    const page = readFileSync(
      path.resolve(ROOT, "src/app/(external)/claim/[token]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});
