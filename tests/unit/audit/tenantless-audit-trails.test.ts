// @vitest-environment node
/**
 * Phase 0a ships two audit trails for actors with no tenant, and they hold
 * different things:
 *
 *   - PlatformAuditEvent + PlatformAuditOutcome (P0.7, lib/audit/platform-audit.ts):
 *     every Workbench write to SAP, fail-closed BEFORE SAP is called.
 *   - PlatformGovernanceAudit (P0.12, writePlatformGovernanceAudit in
 *     lib/studio/audit.ts): passkey enrolment/revocation and STEP_UP_MISSING
 *     admissions of platform admins and organization-less accounts, best-effort.
 *
 * An operator asking "what did this platform admin do?" needs both. These
 * checks keep the names from colliding again and keep each runbook pointing at
 * the other table, so a query against one is not mistaken for the whole trail.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SCHEMA = read("prisma/schema.prisma");
const MODELS = [...SCHEMA.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);

const SAP_WRITE_TABLES = ["PlatformAuditEvent", "PlatformAuditOutcome"] as const;
const GOVERNANCE_TABLE = "PlatformGovernanceAudit";
const TENANTLESS_AUDIT_TABLES = [...SAP_WRITE_TABLES, GOVERNANCE_TABLE] as const;

const RUNBOOKS = ["docs/runbooks/coreedge-step-up.md", "docs/runbooks/sap-workbench-write-back.md"] as const;

function modelBlock(name: string): string {
  const start = SCHEMA.search(new RegExp(`^model\\s+${name}\\s*\\{`, "m"));
  expect(start, `model ${name} is not in schema.prisma`).toBeGreaterThanOrEqual(0);
  // The doc comment above the model plus its body.
  const before = SCHEMA.lastIndexOf("\n\n", start);
  const end = SCHEMA.indexOf("\n}", start);
  return SCHEMA.slice(before, end);
}

describe("tenantless audit trails", () => {
  it("all three tables exist", () => {
    for (const t of TENANTLESS_AUDIT_TABLES) expect(MODELS).toContain(t);
  });

  it("no audit model name is a prefix of another (a query for one must not read as the other)", () => {
    const audit = MODELS.filter((m) => /Audit/.test(m));
    const clashes = audit.flatMap((a) => audit.filter((b) => b !== a && b.startsWith(a)).map((b) => `${a} ⊂ ${b}`));
    expect(clashes).toEqual([]);
  });

  it("the audit modules export no type that shadows a Prisma model", () => {
    for (const file of ["src/lib/audit/platform-audit.ts", "src/lib/studio/audit.ts"]) {
      const exported = [...read(file).matchAll(/^export\s+(?:type|interface|class|enum)\s+(\w+)/gm)].map((m) => m[1]!);
      expect(
        exported.filter((n) => MODELS.includes(n)),
        `${file} exports a type named like a Prisma model`,
      ).toEqual([]);
    }
  });

  it("each schema comment points at the other trail", () => {
    expect(modelBlock(GOVERNANCE_TABLE)).toContain("PlatformAuditEvent");
    expect(modelBlock("PlatformAuditEvent")).toContain(GOVERNANCE_TABLE);
  });

  it.each(RUNBOOKS)("%s names every tenantless audit table", (runbook) => {
    const text = read(runbook);
    for (const t of TENANTLESS_AUDIT_TABLES) expect(text, `${runbook} does not mention ${t}`).toContain(t);
  });
});
