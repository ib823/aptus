// @vitest-environment node
/**
 * SEC-02 — the internal-testing sign-in surfaces are ABSENT from a production
 * build, not disabled inside one.
 *
 * /api/auth/test-login and /dev-login mint a real session for a test user.
 * They were protected by four runtime environment gates, a secret, a minimum
 * secret length and an optional IP allow-list — a good set of gates, and still
 * the wrong shape: every one of them is a condition evaluated by code that is
 * present and reachable in the production bundle. The whole backdoor therefore
 * rests on four environment variables staying unset, and one of them set by
 * mistake — or set deliberately for an internal test deploy and never unset —
 * leaves E2E_TEST_SECRET as the only thing between the internet and a
 * platform_admin session.
 *
 * The fix is structural: the files are named `route.e2e.ts` / `page.e2e.tsx`,
 * and next.config.ts lists the `e2e.*` page extensions only for non-production
 * builds. On a customer-facing deploy Next does not treat them as routes at
 * all, so the paths 404 from the router and no environment variable can bring
 * them back.
 *
 * This asserts the mechanism rather than the intention, because a rename is
 * exactly the kind of change a later refactor undoes without noticing: a file
 * moved back to `route.ts` is compiled into production again, silently, and
 * every runtime gate still passes its own tests.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Every surface whose only job is to sign someone in without credentials. */
const TEST_AUTH_FILES = [
  "src/app/api/auth/test-login/route.e2e.ts",
  "src/app/(auth)/dev-login/page.e2e.tsx",
];

describe("the files are named so a production build does not pick them up", () => {
  it.each(TEST_AUTH_FILES)("%s exists", (file) => {
    expect(existsSync(join(ROOT, file))).toBe(true);
  });

  it("and the plain-extension versions do NOT — those would be compiled in", () => {
    for (const file of ["src/app/api/auth/test-login/route.ts", "src/app/(auth)/dev-login/page.tsx"]) {
      expect(existsSync(join(ROOT, file)), file).toBe(false);
    }
  });
});

/*
 * The config is IMPORTED and its value read, rather than its source matched.
 * pageExtensions is the whole mechanism, so the test that matters is what the
 * option actually resolves to for each kind of deploy.
 */
describe("the resolved pageExtensions", () => {
  const ENV_KEYS = ["VERCEL_ENV", "NODE_ENV"] as const;
  const saved = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    saved.clear();
  });

  async function pageExtensionsFor(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
    for (const k of ENV_KEYS) {
      if (!saved.has(k)) saved.set(k, process.env[k]);
      const value = env[k];
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
    vi.resetModules();
    const mod = (await import("../../../next.config")) as { default: { pageExtensions?: string[] } };
    return mod.default.pageExtensions ?? [];
  }

  it("omits the e2e extensions on a Vercel production deploy", async () => {
    const exts = await pageExtensionsFor({ VERCEL_ENV: "production", NODE_ENV: "production" });
    expect(exts).toEqual(["tsx", "ts", "jsx", "js"]);
    expect(exts.some((e) => e.startsWith("e2e."))).toBe(false);
  });

  it("…and on a production build off Vercel", async () => {
    const exts = await pageExtensionsFor({ VERCEL_ENV: undefined, NODE_ENV: "production" });
    expect(exts.some((e) => e.startsWith("e2e."))).toBe(false);
  });

  it("includes them on a Preview deploy, which is what E2E runs against", async () => {
    const exts = await pageExtensionsFor({ VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(exts).toEqual(["e2e.tsx", "e2e.ts", "tsx", "ts", "jsx", "js"]);
  });

  it("includes them in development", async () => {
    const exts = await pageExtensionsFor({ VERCEL_ENV: undefined, NODE_ENV: "development" });
    expect(exts).toContain("e2e.ts");
    // The defaults are never lost — dropping them would hide every real page.
    for (const e of ["tsx", "ts", "jsx", "js"]) expect(exts, e).toContain(e);
  });
});

describe("next.config.ts excludes the e2e extensions from a production build", () => {
  const config = read("next.config.ts");

  it("declares the e2e extensions and the defaults separately", () => {
    // Restating the defaults matters: setting pageExtensions REPLACES them, so a
    // list of only the e2e extensions would make every real page invisible.
    expect(config).toContain('const PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];');
    expect(config).toContain('const TEST_AUTH_PAGE_EXTENSIONS = ["e2e.tsx", "e2e.ts"];');
  });

  it("adds them only when the build is not a production deploy", () => {
    expect(config).toContain("pageExtensions: isProductionDeploy");
    expect(config).toMatch(/isProductionDeploy\s*\n?\s*\?\s*PAGE_EXTENSIONS/);
    expect(config).toMatch(/:\s*\[\.\.\.TEST_AUTH_PAGE_EXTENSIONS,\s*\.\.\.PAGE_EXTENSIONS\]/);
  });

  it("decides 'production' the same way the env checker does", () => {
    // Two different answers to "is this production" is how a surface ends up
    // excluded from the build whose env check permitted it, or the reverse.
    const check = read("scripts/check-production-env.js");
    for (const src of [config, check]) {
      expect(src).toContain('process.env.VERCEL_ENV === "production"');
      expect(src).toContain('process.env.NODE_ENV === "production"');
    }
  });
});

describe("the runtime gates stay — they are what protects a Preview deployment", () => {
  const route = read("src/app/api/auth/test-login/route.e2e.ts");

  it("still requires the flag, the non-production check, the secret and its length", () => {
    expect(route).toContain('process.env.ENABLE_TEST_LOGIN_ENDPOINT !== "true"');
    expect(route).toContain('process.env.ALLOW_TEST_LOGIN_IN_PROD !== "true"');
    expect(route).toContain("const secret = process.env.E2E_TEST_SECRET");
    expect(route).toContain("secret.length < 24");
    expect(route).toContain("timingSafeEqual");
  });

  /*
   * The role went into User.role unvalidated, so the secret holder could write
   * any string at all. A role nobody's permission table knows is not a harmless
   * typo — every role comparison in the product fails against it and the
   * resulting session is one no screen can reason about.
   */
  it("validates the requested role against the real vocabulary", () => {
    expect(route).toContain("ALL_USER_ROLES");
    expect(route).toContain("includes(requestedRole)");
    expect(route).not.toContain("const role = body.role ?? TEST_USER_ROLE;");
  });
});
