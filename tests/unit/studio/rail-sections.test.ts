// @vitest-environment node
/**
 * Admin-only rail entries, one rule for every workspace.
 *
 * Operations has filtered `adminOnly` (Catalogue health) since that screen
 * shipped; Control Tower's layout passed its sections through unfiltered,
 * which was harmless only while none was admin-only. The parity scorecard
 * (P1.9) is the first, so the rule moved into `railSections` and both layouts
 * call it: a screen marked admin-only cannot be hidden in one rail and listed
 * in the next.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONTROL_TOWER_SECTIONS, OPERATIONS_SECTIONS, railSections } from "@/lib/studio/sections";

const keys = (sections: readonly { key: string }[]) => sections.map((s) => s.key);

describe("railSections", () => {
  it("shows Control Tower readers every screen but the parity scorecard", () => {
    for (const role of ["partner_lead", "executive_sponsor", "project_manager"]) {
      const rail = keys(railSections(CONTROL_TOWER_SECTIONS, role));
      expect(rail, role).not.toContain("parity");
      expect(rail, role).toEqual(keys(CONTROL_TOWER_SECTIONS).filter((k) => k !== "parity"));
    }
  });

  it("shows a platform administrator the parity scorecard, under either spelling of the role", () => {
    for (const role of ["platform_admin", "admin"]) {
      expect(keys(railSections(CONTROL_TOWER_SECTIONS, role)), role).toEqual(keys(CONTROL_TOWER_SECTIONS));
    }
  });

  it("keeps the Operations Center's rule: Catalogue health for administrators only", () => {
    expect(keys(railSections(OPERATIONS_SECTIONS, "support"))).not.toContain("catalogue");
    expect(keys(railSections(OPERATIONS_SECTIONS, "platform_admin"))).toContain("catalogue");
  });

  it("is the filter both layouts use", () => {
    const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
    expect(read("src/app/(control-tower)/layout.tsx")).toContain("sections={railSections(CONTROL_TOWER_SECTIONS, user.role)}");
    expect(read("src/app/(operations)/layout.tsx")).toContain("railSections(OPERATIONS_SECTIONS, user.role)");
  });
});
