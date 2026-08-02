/**
 * Every Affirm bundle page authorizes, not just the API behind it.
 *
 * THE HOLE THIS CLOSES. `requireAffirmBundleAccess` guarded every
 * `/api/affirm/bundles/[id]/*` route — so one consultant could not MUTATE
 * another's bundle. The pages that RENDER that bundle checked for a session and
 * nothing else:
 *
 *     const user = await getCurrentUser();
 *     if (!user) redirect("/presales/login");
 *     const bundle = await prisma.affirmBundle.findUnique({ where: { id } });
 *
 * Any signed-in user — including `viewer`, which has no other privilege
 * anywhere — could open any bundle by id and read the client's name, every
 * question, every answer with the client's stated reason for deviating, and the
 * signed record. `/affirm` listed every consultant's bundles unscoped, so the
 * ids did not even have to be guessed: the index was a directory.
 *
 * A lock on the mutation path with none on the read path is not a partial
 * guard. For a screen whose entire purpose is displaying the data, it is no
 * guard at all.
 *
 * WHY THIS IS A SOURCE-LEVEL TEST. The rule is one line per page, and the
 * failure mode is a NEW page being added without it — which no test of the
 * existing pages' behaviour can catch. So the check is "every page that loads a
 * bundle also applies the predicate", asserted over the route tree, and a new
 * unguarded page fails by name.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { affirmBundleReadableBy, affirmBundleScope } from "@/lib/affirm/authz";

const AFFIRM_PAGES_ROOT = path.resolve(process.cwd(), "src/app/(workbench)/affirm");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

const PAGES = pageFiles(AFFIRM_PAGES_ROOT);

/** Pages that read a specific bundle, and therefore must authorize. */
const BUNDLE_PAGES = PAGES.filter((p) =>
  /affirmBundle\.findUnique/.test(readFileSync(p, "utf8")),
);

const rel = (p: string) => path.relative(process.cwd(), p);

describe("the page scan found something to check", () => {
  it("walked the affirm route tree", () => {
    // A broken walk returns [] and every assertion below passes vacuously.
    expect(PAGES.length).toBeGreaterThan(4);
    expect(BUNDLE_PAGES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("every page that loads a bundle checks who is asking", () => {
  it.each(BUNDLE_PAGES.map((p) => [rel(p), p] as const))("%s", (name, file) => {
    const source = readFileSync(file, "utf8");
    expect(
      /affirmBundleReadableBy\s*\(/.test(source),
      `${name} reads a bundle by id without authorizing it.\n` +
        "Add, immediately after the existing `if (!bundle) notFound();`:\n" +
        "  if (!affirmBundleReadableBy(bundle, user)) notFound();",
    ).toBe(true);
  });

  it("refuses rather than redirecting, so it does not confirm a bundle exists", () => {
    // 404 and not 403: telling an unauthorized caller that a bundle with this id
    // exists is itself a disclosure across consultants.
    for (const file of BUNDLE_PAGES) {
      const source = readFileSync(file, "utf8");
      const guard = source.match(/if \(!affirmBundleReadableBy\([^)]*\)\)\s*(\w+)/);
      expect(guard?.[1], `${rel(file)} must notFound() on refusal`).toBe("notFound");
    }
  });
});

describe("the index lists only what the caller may open", () => {
  const indexSource = readFileSync(path.join(AFFIRM_PAGES_ROOT, "page.tsx"), "utf8");

  it("scopes the query rather than filtering afterwards", () => {
    expect(
      /affirmBundleScope\s*\(/.test(indexSource),
      "/affirm must scope its findMany — an in-memory filter still reads every " +
        "consultant's bundles out of the database, and `take` would page over rows " +
        "the caller cannot see.",
    ).toBe(true);
  });

  it("counts the same set it lists", () => {
    // A total computed over every bundle beside a list showing only yours is a
    // disclosure in miniature: "22 bundles" tells you how many exist.
    expect(/affirmBundle\.count\(\{\s*where:/.test(indexSource)).toBe(true);
  });
});

describe("the rule itself", () => {
  const admin = { id: "u-admin", role: "platform_admin" as const };
  const consultant = { id: "u-1", role: "consultant" as const };
  const other = { id: "u-2", role: "consultant" as const };

  it("lets the creator in", () => {
    expect(affirmBundleReadableBy({ createdById: "u-1" }, consultant)).toBe(true);
  });

  it("keeps another consultant out", () => {
    expect(affirmBundleReadableBy({ createdById: "u-1" }, other)).toBe(false);
  });

  it("lets a platform admin in", () => {
    expect(affirmBundleReadableBy({ createdById: "u-1" }, admin)).toBe(true);
  });

  it("makes an ownerless bundle admin-only", () => {
    // There is nobody else it could belong to, so it must not fall to everyone.
    expect(affirmBundleReadableBy({ createdById: null }, consultant)).toBe(false);
    expect(affirmBundleReadableBy({ createdById: null }, admin)).toBe(true);
  });

  it("does not treat a viewer as a consultant", () => {
    expect(affirmBundleReadableBy({ createdById: "u-1" }, { id: "u-9", role: "viewer" as const })).toBe(
      false,
    );
  });

  it("scopes a list to the caller, and only widens for an admin", () => {
    expect(affirmBundleScope(consultant)).toEqual({ createdById: "u-1" });
    expect(affirmBundleScope(admin)).toEqual({});
  });
});
