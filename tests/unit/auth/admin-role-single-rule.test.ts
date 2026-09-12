/**
 * One rule for "is this an admin" (audit E14, P2).
 *
 * Four places hand-wrote `["platform_admin", "admin"].includes(user.role)` — the
 * admin layout, the brownfield guide content route, the portal nav and the mobile
 * tab bar. `"admin"` is a `LegacyUserRole`, not a member of `UserRole`, so as a
 * literal it is dead: no session carries it, and TypeScript cannot say so because
 * `.includes` on a `string[]` accepts anything.
 *
 * IT WAS NOT SIMPLY DELETED. Dropping `"admin"` from those arrays would change
 * behaviour for any row still holding the legacy value — locking a real
 * administrator out rather than tidying a string. `mapLegacyRole` has mapped it to
 * `platform_admin` since Phase 17, and is what `isAdminRole` already delegated to.
 * So the four copies became one call to the rule that was always the real one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isAdminRoleName } from "@/lib/auth/role-migration";
import { ALL_USER_ROLES } from "@/types/assessment";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

const CALLERS = [
  "src/app/(portal)/admin/layout.tsx",
  "src/app/api/brownfield-guides/[guideId]/content/route.ts",
  "src/components/layout/PortalNav.tsx",
  "src/components/pwa/MobileBottomTabBar.tsx",
];

describe("the dead string is gone from every copy", () => {
  it.each(CALLERS)("%s no longer hand-writes the role list", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\["platform_admin",\s*"admin"\]/);
  });

  it.each(CALLERS)("%s calls the shared rule instead", (file) => {
    expect(read(file)).toContain("isAdminRoleName");
  });

  it("nothing anywhere in src still hand-writes it", async () => {
    // The four were found by grep, and a fifth arriving later is the failure
    // mode this assertion exists for.
    //
    // COMMENT LINES ARE EXCLUDED, and this test found out why the hard way: the
    // doc comment on `isAdminRoleName` QUOTES the pattern in order to explain
    // what it replaced. Describing a defect is not committing it, and a rule
    // that forbids writing the old shape down would delete the explanation of
    // why the new one exists.
    const { execSync } = await import("node:child_process");
    const hits = execSync(
      `grep -rn '\\["platform_admin", *"admin"\\]' src --include=*.ts --include=*.tsx || true`,
      { cwd: ROOT, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .filter((line) => {
        const body = line.slice(line.indexOf(":", line.indexOf(":") + 1) + 1).trim();
        return !body.startsWith("*") && !body.startsWith("//") && !body.startsWith("/*");
      });
    expect(hits).toEqual([]);
  });
});

describe("the rule itself", () => {
  it("accepts platform_admin", () => {
    expect(isAdminRoleName("platform_admin")).toBe(true);
  });

  it("still accepts the legacy value, because a row may still hold it", () => {
    // This is why the string was moved rather than deleted.
    expect(isAdminRoleName("admin")).toBe(true);
  });

  it("refuses every other current role", () => {
    for (const role of ALL_USER_ROLES) {
      if (role === "platform_admin") continue;
      expect(isAdminRoleName(role), `${role} must not be admin`).toBe(false);
    }
  });

  it("refuses an unknown role, null and undefined", () => {
    // mapLegacyRole falls back to "viewer" for an unrecognised string, so an
    // invented role can never reach admin by accident.
    for (const bad of ["superuser", "", null, undefined]) {
      expect(isAdminRoleName(bad)).toBe(false);
    }
  });
});

describe("there is exactly one definition", () => {
  it("permissions.isAdminRole delegates rather than repeating the test", async () => {
    const { isAdminRole } = await import("@/lib/auth/permissions");
    for (const role of [...ALL_USER_ROLES, "admin", "executive", "nonsense"]) {
      expect(isAdminRole(role), role).toBe(isAdminRoleName(role));
    }
  });

  it("the rule lives in a module client components can import", () => {
    // Two of the four callers are client components, and permissions.ts imports
    // prisma. role-migration imports nothing but types; lib-layering.test.ts is
    // what keeps that true.
    const src = read("src/lib/auth/role-migration.ts");
    expect(src).not.toContain("@/lib/db/prisma");
  });
});
