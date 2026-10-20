// @vitest-environment node
/**
 * The release protocol (P0.17) is wired where it has to run: the CI gates in
 * migration-integrity.yml, the commands in package.json, the operator
 * settings in .env.example, and the runbook that names every step and leaves
 * the recovery numbers to the product owner.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ENV } from "../../../scripts/lib/post-deploy-check";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Read as text: the repository has no YAML parser, and these are plain lines.
const workflow = read(".github/workflows/migration-integrity.yml");
/** The workflow's steps, each from its "- name:" or "- uses:" line to the next. */
const steps = workflow.split(/\n(?= {6}- (?:name|uses):)/).slice(1);

describe("migration-integrity.yml", () => {
  it("runs on every pull request and every push to main", () => {
    expect(workflow).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/m);
  });

  it("checks out the whole history, so main and the push's parent can be compared", () => {
    const checkout = steps.find((s) => s.includes("uses: actions/checkout"));
    expect(checkout).toMatch(/fetch-depth: 0/);
  });

  it("holds the protocol against origin/main on a pull request, and against the push's parent on main", () => {
    const gate = steps.find((s) => s.includes("pnpm migrations:check"));
    expect(gate).toContain('pnpm migrations:check --base "$BASE"');
    expect(gate).toContain('BASE="origin/main"');
    expect(gate).toContain("BEFORE: ${{ github.event.before }}");
  });

  it("rehearses every backout last, on the database migrate deploy built", () => {
    const deploy = steps.findIndex((s) => s.includes("run: npx prisma migrate deploy"));
    const rehearse = steps.findIndex((s) => s.includes("run: pnpm migrations:rehearse-backout"));
    expect(deploy).toBeGreaterThan(-1);
    expect(rehearse).toBe(steps.length - 1);
    expect(steps[rehearse]).toMatch(/REHEARSAL_DATABASE_URL: postgresql:\/\/postgres:postgres@localhost:5432\/migration_integrity\n/);
  });
});

describe("package.json", () => {
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

  it("has the protocol's commands", () => {
    expect(scripts["migrations:check"]).toBe("tsx scripts/check-migration-protocol.ts");
    expect(scripts["migrations:backout-sql"]).toBe("tsx scripts/migration-backout.ts sql");
    expect(scripts["migrations:rehearse-backout"]).toBe("tsx scripts/migration-backout.ts rehearse");
    expect(scripts["release:post-deploy-check"]).toBe("tsx scripts/coreedge/post-deploy-check.ts");
  });

  it("does not run any of them in the production build", () => {
    expect(scripts["vercel-build"]).not.toMatch(/migrations:|post-deploy|migration-backout|check-migration-protocol/);
  });
});

describe("the operator settings", () => {
  const example = read(".env.example");

  it.each([...Object.values(ENV), "REHEARSAL_DATABASE_URL", "SHADOW_DATABASE_URL"])(
    "%s is documented in .env.example, commented out",
    (name) => {
      expect(example).toMatch(new RegExp(`^# ${name}=`, "m"));
    },
  );
});

describe("the runbook", () => {
  const runbook = read("docs/runbooks/coreedge-release.md");

  it("has the six steps", () => {
    for (const heading of [
      "## Step 1: a pull request with green CI",
      "## Step 2: additive migrations, each with backout SQL",
      "## Step 3: a Vercel Preview on its own database",
      "## Step 4: promote",
      "## Step 5: the post-deploy check",
      "## Step 6: rollback",
    ]) {
      expect(runbook).toContain(heading);
    }
  });

  it("says every production deploy records the checklist", () => {
    expect(runbook).toContain("**Every production deploy records the checklist**");
  });

  it("leaves RPO and RTO to the product owner, as open decisions", () => {
    expect(runbook).toMatch(/- \*\*D1, RPO and RTO\.\*\*[\s\S]{0,200}Owner: the product owner/);
    expect(runbook).not.toMatch(/\b(RPO|RTO) (of|is|=) \d/);
  });

  it("names the preview isolation check and the rule learned in Phase 0a/0b", () => {
    expect(runbook).toContain("./scripts/verify-preview-db-isolation.sh");
    expect(runbook).toContain("once a migration has been pushed, change it only by adding\na new migration");
  });
});
