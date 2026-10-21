// @vitest-environment node
/**
 * The release protocol (P0.17) is wired where it has to run: the CI gates in
 * migration-integrity.yml, the commands in package.json, the operator
 * settings in .env.example, and the runbook that names every step and leaves
 * the recovery numbers to the product owner.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  it("holds the protocol against the pull request's own base branch, and against the push's parent on main", () => {
    const gate = steps.find((s) => s.includes("pnpm migrations:check"))!;
    expect(gate).toContain('pnpm migrations:check --base "$BASE"');
    expect(gate).toContain("BEFORE: ${{ github.event.before }}");
    // A pull request stacked on a branch that is behind main is not removing
    // the migrations main gained since: it is compared with the branch it
    // merges into (main, for a pull request to main). The branch name comes
    // in through the environment, never spliced into the script.
    expect(gate).toContain("BASE_REF: ${{ github.base_ref }}");
    expect(gate).toContain('BASE="origin/$BASE_REF"');
    expect(gate).not.toContain('BASE="origin/main"');
    expect(gate.slice(gate.indexOf("run: |"))).not.toContain("${{");
  });

  it("rehearses every backout last, on the database migrate deploy built", () => {
    const deploy = steps.findIndex((s) => s.includes("run: npx prisma migrate deploy"));
    const rehearse = steps.findIndex((s) => s.includes("run: pnpm migrations:rehearse-backout"));
    expect(deploy).toBeGreaterThan(-1);
    expect(rehearse).toBe(steps.length - 1);
    expect(steps[rehearse]).toMatch(/REHEARSAL_DATABASE_URL: postgresql:\/\/postgres:postgres@localhost:5432\/migration_integrity\n/);
  });
});

const scriptsOf = () => (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

describe("package.json", () => {
  const scripts = scriptsOf();

  it("has the protocol's commands", () => {
    expect(scripts["migrations:check"]).toBe("tsx scripts/check-migration-protocol.ts");
    expect(scripts["migrations:backout-sql"]).toBe("tsx scripts/migration-backout.ts sql");
    expect(scripts["migrations:backout-apply"]).toBe("tsx scripts/migration-backout.ts apply");
    expect(scripts["migrations:rehearse-backout"]).toBe("tsx scripts/migration-backout.ts rehearse");
    expect(scripts["release:post-deploy-check"]).toBe("tsx scripts/coreedge/post-deploy-check.ts");
  });

  it("does not run any of them in the production build", () => {
    expect(scripts["vercel-build"]).not.toMatch(/migrations:|post-deploy|migration-backout|check-migration-protocol/);
  });
});

describe("the operator settings", () => {
  const example = read(".env.example");

  it.each([...Object.values(ENV), "REHEARSAL_DATABASE_URL", "SHADOW_DATABASE_URL", "BACKOUT_DATABASE_URL"])(
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

  // schema.prisma has `directUrl = env("DIRECT_DATABASE_URL")`, and the prisma
  // CLI connects to it rather than to DATABASE_URL: a command that sets only
  // DATABASE_URL runs on whatever DIRECT_DATABASE_URL holds (shell or .env).
  it("never tells the operator to run a prisma CLI command with only DATABASE_URL set", () => {
    expect(read("prisma/schema.prisma")).toMatch(/directUrl\s*=\s*env\("DIRECT_DATABASE_URL"\)/);
    const lines = runbook.split("\n");
    const offenders = lines.filter((line, i) => {
      if (!/\bprisma (db execute|migrate (status|deploy|resolve))\b/.test(line)) return false;
      // The command's own line, or the export lines just above it.
      const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      return /\bDATABASE_URL=/.test(context) && !/\bDIRECT_DATABASE_URL=/.test(context);
    });
    expect(offenders).toEqual([]);
    expect(runbook).not.toMatch(/DATABASE_URL="[^"]*" pnpm exec prisma db execute/);
  });

  it("backs a migration out with migrations:backout-apply, after removing it from main", () => {
    const step6 = runbook.slice(runbook.indexOf("## Step 6: rollback"), runbook.indexOf("## Recovery"));
    expect(step6).toContain("every production build of `main` runs `migrate deploy` against the\nproduction database, promoted or not");
    const remove = step6.indexOf("**Remove the migration from `main` first.**");
    const wait = step6.indexOf("**Wait until no production build holds the directory.**");
    const apply = step6.indexOf("pnpm migrations:backout-apply");
    expect(remove).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(remove);
    expect(apply).toBeGreaterThan(wait);
  });

  // A migration that changes data once leaves the old build's writes during
  // the build behind; its runbook asks for a command after promotion. The
  // release protocol is the procedure operators follow, so it must carry it,
  // and carry it again after a roll-forward.
  describe("post-promote commands", () => {
    const step4 = runbook.slice(runbook.indexOf("## Step 4: promote"), runbook.indexOf("## Step 5: the post-deploy check"));
    const table = step4.slice(step4.indexOf("### After promotion: the release's own commands"));
    const step6 = runbook.slice(runbook.indexOf("## Step 6: rollback"), runbook.indexOf("## Recovery"));

    it("lists contracts:stamp for the contract-stamps migration, before the post-deploy check", () => {
      expect(table).toMatch(/^\| `20261023010000_contract_stamps` \| `pnpm contracts:stamp`, then[^|]*`pnpm contracts:stamp --apply` \|/m);
      expect(scriptsOf()["contracts:stamp"]).toBeDefined();
      expect(existsSync(join(ROOT, "prisma/migrations/20261023010000_contract_stamps/migration.sql"))).toBe(true);
    });

    it("lists every runbook that asks for a command after the build is promoted", () => {
      const asking = readdirSync(join(ROOT, "docs/runbooks"))
        .filter((f) => f.endsWith(".md") && f !== "coreedge-release.md")
        .filter((f) => /after the build is promoted, run `pnpm /i.test(read(`docs/runbooks/${f}`)));
      expect(asking).toContain("coreedge-contract-hygiene.md");
      for (const f of asking) expect(table).toContain(`docs/runbooks/${f}`);
    });

    it("runs them again after rolling forward from a rollback", () => {
      expect(step6).toMatch(/after rolling forward, run the post-promote commands of step 4/);
    });
  });

  it("tells the operator how to renew the canary's grants, and not to roll back a healthy release for a lapsed one", () => {
    const setup = runbook.slice(runbook.indexOf("### The release canary"), runbook.indexOf("## Step 6: rollback"));
    expect(setup).toContain("GRANT_REQUIRES_EXPIRY");
    expect(setup).toMatch(/\*\*Renewal:\*\*/);
    const failing = runbook.slice(runbook.indexOf("### If the check fails"), runbook.indexOf("### The release canary"));
    expect(failing).toMatch(/- \*\*A canary grant refused:\*\*[\s\S]*GRANT_EXPIRED[\s\S]*it is the canary, not the release/);
  });

  it("names the preview isolation check and the rule learned in Phase 0a/0b", () => {
    expect(runbook).toContain("./scripts/verify-preview-db-isolation.sh");
    expect(runbook).toContain("once a migration has been pushed, change it only by adding\na new migration");
  });
});
