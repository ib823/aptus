/**
 * The per-tenant SAP environment, and the chip that reports it.
 *
 * The design puts a DEV/TEST/PROD chip inside the tenant switcher so a developer
 * sees what they are about to touch before they touch it. The console shipped
 * that chip wired to VERCEL_ENV — the CONSOLE's own deployment environment —
 * which, sitting beside a tenant switcher, read as "you are connected to
 * production SAP". It was removed rather than relabelled, because nothing in the
 * data model could back it.
 *
 * This is the field that backs it, and the rule that governs it:
 *
 *   UNKNOWN RENDERS NOTHING.
 *
 * A default of "DEV" would print a guess as a fact on the one control whose job
 * is to stop an accidental write to production. Of every wrong answer available,
 * a confident "DEV" over a production tenant is the worst.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getConfiguredSapTenants } from "@/lib/sap-public/tdd-connector";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

/**
 * Strip comments before asserting on code.
 *
 * Both files here DISCUSS the things being forbidden — the top bar's header
 * explains why VERCEL_ENV was removed, the migration explains why there is no
 * DEFAULT. Matching raw text would fail on the very prose that documents the
 * decision, which is a test punishing good comments. Line comments first, so a
 * `//` line ending in a glob cannot open a phantom block.
 */
function code(src: string): string {
  return src
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** SQL uses `--` for comments. */
function sqlCode(src: string): string {
  return src.replace(/^\s*--.*$/gm, " ");
}

const ENV_KEYS = ["ZZ_TEST_TENANTS_JSON", "ZZ_TEST_BASE_URL", "ZZ_TEST_TENANT_ENVIRONMENT"];
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("declaring an environment in {PREFIX}_TENANTS_JSON", () => {
  it("carries it through, upper-cased", () => {
    process.env.ZZ_TEST_TENANTS_JSON = JSON.stringify([
      { key: "d", label: "Dev box", baseUrl: "https://d.example", environment: "dev" },
    ]);
    const [t] = getConfiguredSapTenants("ZZ_TEST");
    expect(t?.environment).toBe("DEV");
  });

  it("leaves it undefined when not declared — no invented default", () => {
    process.env.ZZ_TEST_TENANTS_JSON = JSON.stringify([
      { key: "d", label: "Dev box", baseUrl: "https://d.example" },
    ]);
    const [t] = getConfiguredSapTenants("ZZ_TEST");
    expect(t?.environment).toBeUndefined();
  });

  it("treats blank or non-string as undeclared", () => {
    process.env.ZZ_TEST_TENANTS_JSON = JSON.stringify([
      { key: "a", label: "A", baseUrl: "https://a.example", environment: "   " },
      { key: "b", label: "B", baseUrl: "https://b.example", environment: 7 },
    ]);
    const ts = getConfiguredSapTenants("ZZ_TEST");
    expect(ts[0]?.environment).toBeUndefined();
    expect(ts[1]?.environment).toBeUndefined();
  });

  it("accepts a landscape's own vocabulary, not just DEV/TEST/PROD", () => {
    // Free text on purpose: a landscape with "PREPROD" or "SANDBOX" should not be
    // forced to pick the nearest wrong word from a fixed enum.
    process.env.ZZ_TEST_TENANTS_JSON = JSON.stringify([
      { key: "p", label: "Pre", baseUrl: "https://p.example", environment: "preprod" },
    ]);
    expect(getConfiguredSapTenants("ZZ_TEST")[0]?.environment).toBe("PREPROD");
  });

  it("does not break the single-tenant BASE_URL form", () => {
    process.env.ZZ_TEST_BASE_URL = "https://single.example";
    const [t] = getConfiguredSapTenants("ZZ_TEST");
    expect(t?.key).toBe("default");
    expect(t?.environment).toBeUndefined();

    process.env.ZZ_TEST_TENANT_ENVIRONMENT = "prod";
    expect(getConfiguredSapTenants("ZZ_TEST")[0]?.environment).toBe("PROD");
  });
});

describe("the chip only claims what is known", () => {
  const topbar = read("src/components/studio/StudioTopBar.tsx");

  it("renders nothing when the environment is unknown", () => {
    // The load-bearing line. Everything else here is presentation.
    expect(topbar).toMatch(/if \(!environment\) return null;/);
  });

  it("never falls back to a default environment string", () => {
    const chip = topbar.match(/function EnvChip[\s\S]*?\n\}/)?.[0] ?? "";
    expect(chip, "EnvChip not found").not.toBe("");
    expect(chip).not.toMatch(/\?\?\s*["'](DEV|TEST|PROD)["']/);
    expect(chip).not.toMatch(/environment\s*\|\|\s*["']/);
  });

  it("says the chip is about SAP, not about the console", () => {
    // The exact confusion the removed VERCEL_ENV badge caused.
    expect(topbar).toContain("SAP environment:");
    expect(topbar).toContain("not the console's own environment");
  });

  it("is not wired to the deployment environment ever again", () => {
    // In CODE. The file header still discusses VERCEL_ENV, because explaining why
    // the badge was removed is the reason nobody re-adds it.
    expect(code(topbar)).not.toMatch(/VERCEL_ENV|NODE_ENV/);
  });

  it("styles PROD distinctly, because that is the case worth noticing", () => {
    expect(topbar).toMatch(/isProd/);
  });
});

describe("the migration", () => {
  const sql = read(
    "prisma/migrations/20260726060000_sap_connection_environment/migration.sql",
  );
  const schema = read("prisma/schema.prisma");

  it("adds the column as nullable, with no default", () => {
    // A NOT NULL DEFAULT 'DEV' would stamp every existing connection with a
    // guess — including production ones — which is precisely the failure the
    // whole change exists to prevent.
    const ddl = sqlCode(sql);
    expect(ddl).toMatch(/ADD COLUMN\s+"environment" TEXT;/);
    expect(ddl).not.toMatch(/NOT NULL/i);
    expect(ddl).not.toMatch(/DEFAULT/i);
  });

  it("is non-destructive", () => {
    expect(sqlCode(sql)).not.toMatch(/DROP|TRUNCATE|DELETE/i);
  });

  it("matches the schema, which also declares it optional", () => {
    expect(schema).toMatch(/environment\s+String\?/);
  });
});
