import { describe, expect, it } from "vitest";
import { ASSESSMENT_STATUSES_V2 } from "@/lib/assessment/status-machine";
import { V1_TO_V2_STATUS_MAP } from "@/lib/assessment/status-machine";

// The Prisma enum lives at @prisma/client. We can't enumerate it directly
// (Prisma generates const objects, not iterable enums), so we read the schema
// SDL the migration is paired with. If the schema and the runtime status
// machine drift, this test goes red.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA_PATH = resolve(process.cwd(), "prisma/schema.prisma");

function readEnumMembers(name: string): string[] {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const match = schema.match(new RegExp(`enum ${name}\\s*\\{([^}]*)\\}`));
  if (!match || !match[1]) throw new Error(`Enum ${name} not found in schema.prisma`);
  return match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*"))
    .map((l) => l.split(/\s+|\/\//)[0]?.trim() ?? "")
    .filter((l) => l.length > 0);
}

describe("AssessmentStatus enum vs runtime status machine", () => {
  const enumMembers = readEnumMembers("AssessmentStatus");

  it("includes every V2 status from the lifecycle state machine", () => {
    for (const v2 of ASSESSMENT_STATUSES_V2) {
      expect(enumMembers, `V2 status "${v2}" must be in the AssessmentStatus enum`).toContain(v2);
    }
  });

  it("includes every V1-only legacy value referenced by V1_TO_V2_STATUS_MAP", () => {
    // The map's keys are V1 values; the enum must accept them so a fresh
    // ALTER COLUMN ... TYPE cast over a database that holds V1 rows succeeds.
    for (const v1 of Object.keys(V1_TO_V2_STATUS_MAP)) {
      expect(enumMembers, `V1 status "${v1}" must be in the AssessmentStatus enum`).toContain(v1);
    }
  });

  it("does not contain stray invented statuses outside V1 ∪ V2", () => {
    const allowed = new Set([...ASSESSMENT_STATUSES_V2, ...Object.keys(V1_TO_V2_STATUS_MAP)]);
    const stray = enumMembers.filter((m) => !allowed.has(m));
    expect(
      stray,
      `Enum contains values not in V1 or V2: ${stray.join(", ")}`,
    ).toEqual([]);
  });
});
