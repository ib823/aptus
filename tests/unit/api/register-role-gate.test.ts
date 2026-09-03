/**
 * Register writes are role-gated, on every mutating handler.
 *
 * THE DEFECT. The three registers (integrations, data migration, OCM) enforced
 * `requireAssessmentAccess` — organization membership or stakeholder status —
 * plus the sign-off lock, and nothing about the ROLE. `assertCanManageRegister`
 * existed and was imported by no route; `canEditRegister` had no consumer. So a
 * viewer, executive sponsor or support user in the same organization could
 * create, edit and delete register rows, while PERMISSION_MATRIX and
 * ROLE_CAPABILITIES.canEditRegisters both said they could not.
 *
 * This scans the nine mutating handlers rather than trusting a list, so a new
 * register route without the gate fails here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getRegisterPermissions } from "@/lib/register/register-helpers";
import { ALL_USER_ROLES } from "@/types/assessment";
import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => stripSource(readFileSync(resolve(ROOT, p), "utf8"), "comments");

const ROUTES: Array<{ file: string; mutators: string[] }> = [
  { file: "src/app/api/assessments/[id]/integrations/route.ts", mutators: ["POST"] },
  { file: "src/app/api/assessments/[id]/integrations/[integrationId]/route.ts", mutators: ["PUT", "DELETE"] },
  { file: "src/app/api/assessments/[id]/data-migration/route.ts", mutators: ["POST"] },
  { file: "src/app/api/assessments/[id]/data-migration/[objectId]/route.ts", mutators: ["PUT", "DELETE"] },
  { file: "src/app/api/assessments/[id]/ocm/route.ts", mutators: ["POST"] },
  { file: "src/app/api/assessments/[id]/ocm/[impactId]/route.ts", mutators: ["PUT", "DELETE"] },
];

/** The body of one exported handler, up to the next export. */
function handler(src: string, method: string): string {
  const start = src.indexOf(`export async function ${method}(`);
  expect(start, `${method} handler missing`).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("every register mutation consults the role capability", () => {
  for (const { file, mutators } of ROUTES) {
    for (const method of mutators) {
      it(`${method} in ${file}`, () => {
        const body = handler(read(file), method);
        expect(body).toContain("getRegisterPermissions(user.role).canEdit");
        // The gate must come AFTER access resolution (it needs `user`) and
        // return a 403, not throw.
        expect(body.indexOf("requireAssessmentAccess(")).toBeLessThan(
          body.indexOf("getRegisterPermissions(user.role).canEdit"),
        );
      });
    }
  }

  it("GET handlers stay open to every member — viewing is not gated", () => {
    for (const { file, mutators } of ROUTES) {
      if (mutators.includes("POST")) {
        const body = handler(read(file), "GET");
        expect(body).not.toContain("getRegisterPermissions(");
      }
    }
  });
});

describe("the capability the gate reads agrees with the role matrix", () => {
  it("is derived from ROLE_CAPABILITIES.canEditRegisters for every role", () => {
    const editors = ALL_USER_ROLES.filter((r) => getRegisterPermissions(r).canEdit);
    // The four roles the matrix names as register editors. A change here is a
    // policy change and should be made in role-permissions.ts, not by
    // loosening this list.
    expect(editors.sort()).toEqual(["consultant", "data_migration_lead", "it_lead", "platform_admin"]);
  });

  it("an unknown role string is not an editor", () => {
    expect(getRegisterPermissions("admin").canEdit).toBe(true); // legacy admin → platform_admin
    expect(getRegisterPermissions("client").canEdit).toBe(false);
    expect(getRegisterPermissions("").canEdit).toBe(false);
  });
});
