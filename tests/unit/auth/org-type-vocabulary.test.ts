/**
 * One vocabulary for organization type, and a parser that can say no.
 *
 * THE DEFECT THIS PINS. `Organization` carries two columns for one idea —
 * `type` and `orgType` — and they were written in two spellings by three code
 * paths: signup wrote `type: "PARTNER"` beside `orgType: "partner"`, the
 * test-login path wrote `type: "partner"`, `ensureOrganization` wrote
 * `type: "client"`. Different screens read different columns, so one
 * organization could display as two different types depending where you looked.
 *
 * It was not cosmetic. `admin/organizations/[orgId]` passes `organization.type`
 * into a prop called `orgType`, which reaches `getRolesForOrgType` and decides
 * WHICH ROLES MAY BE INVITED OR ASSIGNED. The column nothing validated was the
 * one governing access.
 *
 * And the parser could not have caught it: it ended `return upper as
 * CanonicalOrgType`, a cast rather than a check. All four values in use happen
 * to survive that, which is exactly why it went unnoticed — the bug is in what
 * happens to the FIFTH value, and there had not been one yet.
 *
 * So the tests below are in two halves. The first pins the parser's contract.
 * The second is the one that actually prevents recurrence: every org-type
 * literal the codebase writes to the database is read back out of the source
 * and put through the parser. A new writer with a new spelling fails here.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ORG_TYPES,
  getOrgTypeColor,
  getOrgTypeLabel,
  normalizeOrgType,
  parseOrgType,
} from "@/lib/utils/org-type";
import { getRolesForOrgType } from "@/lib/auth/role-metadata";

describe("the parser accepts every spelling that reached the database", () => {
  it.each([
    ["partner", "partner"],
    ["PARTNER", "partner"],
    ["client", "client"],
    ["CLIENT", "client"],
    ["platform", "platform"],
    ["PLATFORM", "platform"],
    // The role-metadata spelling, which is NOT a case transform of "client".
    ["DIRECT_CLIENT", "client"],
    ["direct_client", "client"],
    // Whitespace out of an import or a hand-edited row is not a new type.
    ["  partner  ", "partner"],
  ])("%s → %s", (raw, expected) => {
    expect(parseOrgType(raw)).toBe(expected);
  });
});

describe("the parser refuses what it does not recognise, instead of casting it", () => {
  it.each([["reseller"], ["PARTNERS"], ["direct client"], [""], ["   "]])(
    "%s → null",
    (raw) => {
      expect(parseOrgType(raw)).toBeNull();
      expect(normalizeOrgType(raw)).toBeNull();
    },
  );

  it("returns null for absent values rather than throwing", () => {
    expect(parseOrgType(null)).toBeNull();
    expect(parseOrgType(undefined)).toBeNull();
    expect(normalizeOrgType(null)).toBeNull();
  });

  it("shows an unrecognised value verbatim rather than inventing a label", () => {
    /*
     * The old `getOrgTypeLabel` fell back to the raw string only when the
     * canonical lookup missed — but the cast meant it rarely missed, so
     * "reseller" would have become the label for a canonical type that does not
     * exist. Someone looking at a broken row needs to see the actual string.
     */
    expect(getOrgTypeLabel("reseller")).toBe("reseller");
    expect(getOrgTypeLabel("")).toBe("Unknown");
    expect(getOrgTypeLabel("PARTNER")).toBe("Partner");
    expect(getOrgTypeLabel("client")).toBe("Direct Client");
  });

  it("gives an unrecognised value a neutral badge, not a confident one", () => {
    expect(getOrgTypeColor("reseller")).toContain("slate");
    expect(getOrgTypeColor("partner")).toContain("blue");
  });
});

describe("a recognised type always yields roles; an unrecognised one is refused upstream", () => {
  it.each(ORG_TYPES.map((t) => [t] as const))("%s has at least one assignable role", (orgType) => {
    /*
     * THE FAILURE MODE THE CALLERS NOW DISTINGUISH. `getRolesForOrgType` filters
     * `ROLE_METADATA` by membership, so an org type that matches nothing returns
     * [] — an invite dialog with no roles, which reads as a policy rather than a
     * parse failure. Every canonical type must be non-empty, so an empty list at
     * a call site can only mean the parse failed.
     */
    const canonical = normalizeOrgType(orgType);
    expect(canonical).not.toBeNull();
    expect(getRolesForOrgType(canonical!).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------------- */

/**
 * Every org-type literal the codebase writes, read out of the source.
 *
 * The files are listed rather than globbed: a glob would silently stop covering
 * a path that moved, and this test's whole value is that it fails when a new
 * writer appears. If you add an organization-creating path, add it here.
 */
const WRITERS = [
  "src/app/api/auth/signup/route.ts",
  "src/app/api/auth/test-login/route.ts",
  "src/lib/db/organizations.ts",
];

/** `type: "partner"` / `orgType: 'client'` → the quoted value. */
const WRITE_PATTERN = /\b(?:orgType|type)\s*:\s*["']([A-Za-z_ ]+)["']/g;

/**
 * Comments removed, so the scan reads code and not prose.
 *
 * Caught immediately: the comment explaining that signup USED to write
 * `type: "PARTNER"` was itself matched as a write of "PARTNER". A guard that
 * cannot tell a fixed bug's description from the bug punishes documenting it,
 * and the comment is the most useful part of the fix.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n]*?\/\/.*$/gm, (line) => {
    // Only drop from the `//` onward, so `type: "partner", // note` still counts.
    const i = line.indexOf("//");
    return i === -1 ? line : line.slice(0, i);
  });
}

describe("every org type the codebase writes is in the canonical vocabulary", () => {
  it.each(WRITERS.map((f) => [f] as const))("%s", (file) => {
    const source = stripComments(readFileSync(path.resolve(process.cwd(), file), "utf8"));

    const written = [...source.matchAll(WRITE_PATTERN)]
      .map((m) => m[1]!)
      // `type:` is a common key. Only values that ARE org types are relevant —
      // anything else (a solution kind, an event type) is not this test's
      // business and must not fail it.
      .filter((v) => parseOrgType(v) !== null || ["PARTNER", "CLIENT", "PLATFORM"].includes(v));

    // The writers all set an org type, so finding none means the pattern has
    // stopped matching and this test would pass vacuously.
    expect(written.length, `${file}: no org-type literal found — has the pattern gone stale?`)
      .toBeGreaterThan(0);

    const nonCanonical = written.filter((v) => !(ORG_TYPES as readonly string[]).includes(v));
    expect(
      nonCanonical,
      `${file} writes a non-canonical org type. Canonical is lowercase ` +
        `${ORG_TYPES.join(" | ")} — it matches the OrgType union, the orgType column\n` +
        `default, and the zod enum on PATCH /api/organizations/[orgId].\nFound: ${nonCanonical.join(", ")}`,
    ).toEqual([]);
  });

  it("sets both columns wherever an organization is created", () => {
    /*
     * The two columns are what made this possible in the first place. Until one
     * of them is dropped, a creation path that sets only `type` leaves `orgType`
     * on its default — which happened to agree for the client case and did not
     * for the partner one.
     */
    for (const file of WRITERS) {
      const source = stripComments(readFileSync(path.resolve(process.cwd(), file), "utf8"));
      if (!/organization\.create/.test(source)) continue;
      expect(/\btype\s*:/.test(source), `${file} creates an organization without type`).toBe(true);
      expect(
        /\borgType\s*:/.test(source),
        `${file} creates an organization but never sets orgType — it will fall to the column ` +
          `default and can disagree with type`,
      ).toBe(true);
    }
  });
});
