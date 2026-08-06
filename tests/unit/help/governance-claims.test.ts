/**
 * The governance screens say what the runtime does — pinned.
 *
 * WHY THIS FILE EXISTS. manual-truthfulness.test.ts guards the MANUAL's prose.
 * The worst instances of the drift it hunts were not in the manual — they were
 * on the screens themselves: the API Access page said "these decisions are
 * enforced" while a card on the same page said "runtime enforcement is a later
 * phase"; Control Tower rendered "there is no revocation control" as the lede
 * above a working Revoke button; the server's own refusal message told an
 * approver "there is no way to revoke it afterwards". No test asserted screen
 * copy against shipped capability, which is exactly how all of it survived a
 * suite that pins prose aggressively everywhere else.
 *
 * WHAT IS PINNED, AND HOW. Presence of the corrected claims — the direction
 * that cannot false-positive on comments. (An absence scan over source files
 * would forbid the comments that NARRATE the old claims, and those comments
 * are the record of why the prose reads as it does; the manual test explains
 * the same trade-off.) Each assertion names the file it guards, so a rewrite
 * that drops the claim fails with the place to put it back.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Studio states that grants are enforced and revocable", () => {
  it("the API Access page claims enforcement including revocation, in one voice", () => {
    const page = read("src/app/(studio)/studio/access/page.tsx");
    expect(page).toContain("unrevoked grant");
    // The page resolves revocation for display — the select must carry it.
    expect(page).toContain("revokedAt: true");
  });

  it("the ledger client renders REVOKED as a first-class state", () => {
    const client = read("src/components/studio/AccessGrantsClient.tsx");
    expect(client).toContain('REVOKED: "Revoked"');
    // The progressive-trust footer asserts enforcement, not a later phase.
    expect(client).toContain("each approved grant is enforced");
  });

  it("the grants module's rules and messages describe a live runtime", () => {
    const grants = read("src/lib/studio/grants.ts");
    expect(grants).toContain("ENFORCED AT RUNTIME");
    // The expiry refusal explains revocation as an emergency action, not an
    // impossibility.
    expect(grants).toContain("admin emergency action");
    // The one display vocabulary includes revocation.
    expect(grants).toContain("EffectiveGrantDecision");
  });
});

describe("Control Tower states that revocation exists", () => {
  it("the grants screen lede names revocation beside lapsing", () => {
    const client = read("src/components/control-tower/GrantsClient.tsx");
    expect(client).toContain("admin revocation");
  });

  it("the Control Tower landing page names both admin actions", () => {
    const page = read("src/app/(control-tower)/control-tower/page.tsx");
    expect(page).toContain("revoking a granted one");
  });
});

describe("discovery and the ledger read the same revocation fact", () => {
  it("northbound discovery selects and filters revokedAt", () => {
    const route = read("src/app/api/northbound/interfaces/route.ts");
    expect(route).toContain("revokedAt: true");
    expect(route).toContain("g.revokedAt == null");
  });

  it("the Studio grants GET returns the revocation fields", () => {
    const route = read("src/app/api/studio/access-grants/route.ts");
    expect(route).toContain("revokedAt: true");
    expect(route).toContain("revokedReason: true");
  });
});
