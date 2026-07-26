/**
 * A runtime credential cannot be self-issued.
 *
 * The rule was "the person who owns a solution cannot mint its runtime
 * credential" — the same second-pair-of-eyes principle the access ledger runs
 * on. It was implemented as:
 *
 *   [technicalOwnerId, businessOwnerId, supportOwnerId].includes(user.id)
 *
 * On a solution with NO owners that array is [null, null, null]. It contains
 * nobody. The check passes, and whoever registered the solution issues
 * themselves a credential to a client's live SAP with no oversight at all.
 *
 * Unowned is the DEFAULT state of every newly registered solution, so the way
 * to bypass the control was to skip a step nothing forced you to complete. A
 * governance gate disabled by inaction is not a gate — it is a comment.
 *
 * Found by a consultant issuing a credential for their own solution and asking
 * whether that was a conflict of duty. It was, and nothing had stopped it.
 *
 * These tests exercise the real decision logic against the real shapes, so they
 * fail if either gate is weakened — including by someone "simplifying" the
 * ownership check back into the SoD one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { missingOwners } from "@/lib/studio/solutions";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

function code(src: string): string {
  return src
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

const ROUTE = "src/app/api/studio/clients/route.ts";

/** The bug, reproduced as the predicate that used to stand alone. */
function sodOnly(
  owners: { technicalOwnerId: string | null; businessOwnerId: string | null; supportOwnerId: string | null },
  userId: string,
): boolean {
  return [owners.technicalOwnerId, owners.businessOwnerId, owners.supportOwnerId].includes(userId);
}

describe("the original check was vacuous, and that is why it needed a second gate", () => {
  const unowned = { technicalOwnerId: null, businessOwnerId: null, supportOwnerId: null };

  it("an unowned solution defeats the ownership check entirely", () => {
    // Not a hypothetical: this is precisely what let a self-issued credential
    // through. The predicate is correct in isolation and useless in context.
    expect(sodOnly(unowned, "user_creator")).toBe(false);
  });

  it("and unowned is what every new solution starts as", () => {
    expect(missingOwners(unowned)).toEqual([
      "technical owner",
      "business owner",
      "support owner",
    ]);
  });

  it("so ownership is what makes the SoD check mean anything", () => {
    // With owners present the predicate does its job: the owner is refused, a
    // colleague is not.
    const owned = {
      technicalOwnerId: "user_a",
      businessOwnerId: "user_b",
      supportOwnerId: "user_c",
    };
    expect(missingOwners(owned)).toEqual([]);
    expect(sodOnly(owned, "user_a")).toBe(true);
    expect(sodOnly(owned, "user_d")).toBe(false);
  });

  it("a partially owned solution is still refused", () => {
    // Two of three is not accountability, and it would leave the same gap for
    // whichever role was left blank.
    const partial = {
      technicalOwnerId: "user_a",
      businessOwnerId: null,
      supportOwnerId: "user_c",
    };
    expect(missingOwners(partial)).toEqual(["business owner"]);
    expect(sodOnly(partial, "user_x")).toBe(false);
  });
});

describe("both mint paths carry both gates", () => {
  const src = code(read(ROUTE));

  it("issuing checks ownership before segregation of duties", () => {
    const post = src.slice(src.indexOf("export async function POST"));
    const ownerGate = post.indexOf("missingOwners");
    const sodGate = post.indexOf("isOwner");
    expect(ownerGate, "issue must check owners").toBeGreaterThan(-1);
    expect(sodGate, "issue must check SoD").toBeGreaterThan(-1);
    expect(ownerGate, "ownership must be checked first").toBeLessThan(sodGate);
  });

  it("rotating carries them too — it mints a new token", () => {
    // An owner blocked from issuing could otherwise rotate instead: the same
    // act under a different verb, producing an equally usable token.
    const patch = src.slice(src.indexOf("export async function PATCH"));
    expect(patch).toContain("missingOwners");
    expect(patch).toContain("isOwner");
  });

  it("rotating fails closed when the solution cannot be resolved", () => {
    // `solution?.technicalOwnerId` on a missing row yields
    // [undefined, undefined, undefined] — which contains nobody, so the check
    // passed. A credential whose solution could not be found rotated freely.
    const patch = src.slice(src.indexOf("export async function PATCH"));
    expect(patch).toMatch(/if \(!solution\) return studioError\("NOT_FOUND"/);
    expect(patch, "optional chaining here re-opens the hole").not.toMatch(
      /\[\s*solution\?\.\w+/,
    );
  });

  it("says what to do, not just no", () => {
    // "Forbidden" with no next step turns a governance control into an outage.
    expect(read(ROUTE)).toMatch(/Assign owners before issuing a runtime credential/);
    expect(read(ROUTE)).toMatch(/Ask a colleague to issue it/);
  });
});
