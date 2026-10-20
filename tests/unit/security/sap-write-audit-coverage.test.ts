// @vitest-environment node
/**
 * Every code path that changes data in SAP from outside the broker writes a
 * platform audit row first. Roadmap item P0.7.
 *
 * THE GAP. `POST /api/sap/tdd/write` created records in a live SAP tenant and
 * left no audit row at all, and `hub-content/write-test` created and deleted
 * one with only a best-effort log written after the fact. Both are fixed; this
 * test is what keeps a THIRD route from repeating it. A route that imports a
 * SAP-writing helper and does not `await beginPlatformAudit(...)` before calling
 * it fails here, by name, on the PR that adds it.
 *
 * THREE LAYERS, because a check on the routes alone is easy to walk around:
 *
 *   1. ROUTES. Any file under src/app that imports a helper in
 *      `SAP_WRITING_HELPERS` must import the platform audit, await
 *      `beginPlatformAudit(` before the helper is first called, and call
 *      `completePlatformAudit(` after it.
 *   2. WRAPPERS. A new lib module that wraps a write primitive would be a new
 *      helper the route check does not know about. So the lib modules allowed
 *      to import a primitive are listed, each with the helper it exports; a new
 *      one fails until it is added — which puts its export under layer 1.
 *   3. THE WRITE PRIMITIVES THEMSELVES. A new function that sends POST, PUT,
 *      PATCH, MERGE or DELETE to SAP would be invisible to both layers above.
 *      So the non-GET requests in the modules that talk to SAP are counted and
 *      each one is classified. A new one fails until someone says what it is.
 *
 * WHAT IT DOES NOT COVER, deliberately: the northbound broker's own write
 * (`writeEntitySet`, lib/northbound/write.ts). It is a machine call authorised
 * by a solution's credential and grant, and it has its own trail —
 * `NorthboundAuditEvent`, per organization — whose fail-closed property is
 * roadmap item P3.10, not this one. It is listed in layer 3 so that is a stated
 * decision rather than an omission.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";
import { repoPath } from "../../helpers/source-files";

const ROOT = path.resolve(__dirname, "../../..");

/**
 * Every exported function that changes data in a SAP system on a caller's
 * behalf, outside the broker. Keyed by the module that defines it.
 */
const SAP_WRITING_HELPERS: Record<string, string> = {
  createSapEntitySetRecord: "src/lib/sap-public/tdd-connector.ts",
  deleteSapEntityByLocation: "src/lib/sap-public/tdd-connector.ts",
  runCapabilityWriteTest: "src/lib/sap-public/capability-write-test.ts",
};

/**
 * Lib modules allowed to import a write primitive, and the helper each one
 * exports in turn (which must itself be in SAP_WRITING_HELPERS).
 */
const WRAPPERS: Record<string, string[]> = {
  "src/lib/sap-public/capability-write-test.ts": ["runCapabilityWriteTest"],
};

/**
 * Every non-GET request in the modules that talk to SAP, classified. The count
 * per file is pinned: a new one fails until it is put in one of these buckets.
 */
const NON_GET_REQUESTS: Record<string, { count: number; what: string }> = {
  "src/lib/sap-public/tdd-connector.ts": {
    count: 3,
    what: "OAuth client-credentials token (no SAP data); createSapEntitySetRecord POST; deleteSapEntityByLocation DELETE — both SAP_WRITING_HELPERS",
  },
  "src/lib/sap-public/connection-resolver.ts": { count: 1, what: "OAuth token request — no SAP data changes" },
  "src/lib/sap-public/oauth-saml-bearer.ts": { count: 1, what: "SAML bearer token exchange — no SAP data changes" },
  "src/lib/sap-public/ariba-connector.ts": { count: 1, what: "Ariba OAuth token request — no SAP data changes" },
  "src/lib/northbound/write.ts": {
    count: 1,
    what: "the broker's governed write (writeEntitySet) — audited per organization in NorthboundAuditEvent; fail-closed is P3.10",
  },
};

/** The directories whose modules make requests to SAP. */
const SAP_CLIENT_DIRS = ["src/lib/sap-public", "src/lib/northbound", "src/lib/sap", "src/lib/sap-content"];

const AUDIT_MODULE = "@/lib/audit/platform-audit";

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

/**
 * The names a source file imports, mapped to the module each came from.
 * Aliases resolve to the ORIGINAL name (`import { a as b }` imports `a`), and a
 * namespace or dynamic import of a module is recorded as `*` — it can reach
 * every helper that module exports.
 */
function importsOf(src: string): Array<{ name: string; from: string }> {
  const code = stripSource(src, "comments");
  const found: Array<{ name: string; from: string }> = [];
  for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (name) found.push({ name, from: m[2]! });
    }
  }
  for (const m of code.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*["']([^"']+)["']/g)) {
    found.push({ name: "*", from: m[1]! });
  }
  for (const m of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ name: "*", from: m[1]! });
  }
  return found;
}

/** `@/lib/x/y` → `src/lib/x/y.ts`; anything else is left as written. */
function moduleFile(specifier: string): string {
  return specifier.startsWith("@/") ? `src/${specifier.slice(2)}.ts` : specifier;
}

/** Which SAP-writing helpers a file can reach through its imports. */
function sapWritingHelpersImported(src: string): string[] {
  const helpers = new Set<string>();
  for (const { name, from } of importsOf(src)) {
    const file = moduleFile(from);
    for (const [helper, home] of Object.entries(SAP_WRITING_HELPERS)) {
      if (home !== file) continue;
      if (name === helper || name === "*") helpers.add(helper);
    }
  }
  return [...helpers].sort();
}

/**
 * Why a file that imports a SAP-writing helper is not audited, or [] if it is.
 * Pure, so the check itself can be tested on sources written to fail it.
 */
function auditFindings(src: string): string[] {
  const helpers = sapWritingHelpersImported(src);
  if (helpers.length === 0) return [];

  const findings: string[] = [];
  const imports = importsOf(src);
  for (const fn of ["beginPlatformAudit", "completePlatformAudit"]) {
    if (!imports.some((i) => i.name === fn && i.from === AUDIT_MODULE)) {
      findings.push(`does not import ${fn} from ${AUDIT_MODULE}`);
    }
  }

  // Code only: a call named in a comment or a string must not count.
  const code = stripSource(src, "comments-and-strings");
  const firstCall = Math.min(
    ...helpers.map((h) => {
      const m = new RegExp(`\\b${h}\\s*\\(`).exec(code);
      return m ? m.index : Number.POSITIVE_INFINITY;
    }),
  );
  if (firstCall === Number.POSITIVE_INFINITY) return findings;

  const begin = /\bawait\s+beginPlatformAudit\s*\(/.exec(code);
  if (!begin) {
    findings.push("never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route");
  } else if (begin.index > firstCall) {
    findings.push("calls SAP before beginPlatformAudit( — the row must be written BEFORE SAP is called");
  }
  const complete = /\bcompletePlatformAudit\s*\(/g;
  let completesAfter = false;
  for (let m = complete.exec(code); m; m = complete.exec(code)) {
    if (m.index > firstCall) completesAfter = true;
  }
  if (!completesAfter) findings.push("never calls completePlatformAudit( after the SAP call — the outcome is not recorded");
  return findings;
}

describe("the coverage check itself", () => {
  // A static check that silently passes what it cannot read reports success
  // forever. These sources are written to fail it.
  const header = `import { createSapEntitySetRecord } from "@/lib/sap-public/tdd-connector";\n`;
  const audit = `import { beginPlatformAudit, completePlatformAudit } from "@/lib/audit/platform-audit";\n`;

  it("fails a route that writes to SAP with no audit at all", () => {
    expect(auditFindings(`${header}export async function POST() { await createSapEntitySetRecord(); }`)).toEqual([
      `does not import beginPlatformAudit from ${AUDIT_MODULE}`,
      `does not import completePlatformAudit from ${AUDIT_MODULE}`,
      "never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route",
      "never calls completePlatformAudit( after the SAP call — the outcome is not recorded",
    ]);
  });

  it("fails a route that writes the row AFTER calling SAP", () => {
    const src = `${header}${audit}export async function POST() {
      const r = await createSapEntitySetRecord();
      const a = await beginPlatformAudit({});
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(src)).toEqual([
      "calls SAP before beginPlatformAudit( — the row must be written BEFORE SAP is called",
    ]);
  });

  it("fails a route that fires the row without awaiting it", () => {
    const src = `${header}${audit}export async function POST() {
      void beginPlatformAudit({});
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(src)).toContain(
      "never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route",
    );
  });

  it("is not satisfied by a call that exists only in a comment", () => {
    const src = `${header}${audit}export async function POST() {
      // await beginPlatformAudit(input) — TODO
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(src)).toContain(
      "never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route",
    );
  });

  it("sees through an alias and a namespace import", () => {
    expect(
      sapWritingHelpersImported(`import { runCapabilityWriteTest as go } from "@/lib/sap-public/capability-write-test";`),
    ).toEqual(["runCapabilityWriteTest"]);
    expect(sapWritingHelpersImported(`import * as sap from "@/lib/sap-public/tdd-connector";`)).toEqual([
      "createSapEntitySetRecord",
      "deleteSapEntityByLocation",
    ]);
  });

  it("passes a route that awaits the row first and records the outcome after", () => {
    const src = `${header}${audit}export async function POST() {
      const a = await beginPlatformAudit({});
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(src)).toEqual([]);
  });

  it("ignores a file that imports no SAP-writing helper", () => {
    expect(auditFindings(`import { getSapTenant } from "@/lib/sap-public/tdd-connector";`)).toEqual([]);
  });
});

describe("every SAP write outside the broker is audited before SAP is called (P0.7)", () => {
  const files = walk(path.join(ROOT, "src")).map((f) => ({ file: repoPath(f, ROOT), src: readFileSync(f, "utf8") }));

  it("each helper is still exported where this test says it is", () => {
    // A renamed helper would make layer 1 match nothing and pass forever.
    for (const [helper, home] of Object.entries(SAP_WRITING_HELPERS)) {
      const src = readFileSync(path.join(ROOT, home), "utf8");
      expect(src, `${helper} is no longer exported from ${home}`).toMatch(
        new RegExp(`export\\s+async\\s+function\\s+${helper}\\b`),
      );
    }
  });

  it("the routes that write to SAP are found — the check is not vacuous", () => {
    const writers = files
      .filter(({ file }) => file.startsWith("src/app/"))
      .filter(({ src }) => sapWritingHelpersImported(src).length > 0)
      .map(({ file }) => file)
      .sort();
    expect(writers).toEqual([
      "src/app/api/sap/tdd/hub-content/write-test/route.ts",
      "src/app/api/sap/tdd/write/route.ts",
    ]);
  });

  it("every file outside src/lib that imports a SAP-writing helper writes the audit row first", () => {
    const offenders = files
      .filter(({ file }) => !file.startsWith("src/lib/"))
      .map(({ file, src }) => ({ file, findings: auditFindings(src) }))
      .filter((o) => o.findings.length > 0);

    expect(
      offenders,
      "These change data in SAP without the platform audit row (lib/audit/platform-audit.ts):\n" +
        offenders.map((o) => `  ${o.file}\n    - ${o.findings.join("\n    - ")}`).join("\n") +
        "\nAwait beginPlatformAudit(...) before the SAP call and return platformAuditUnavailable() if it throws;" +
        " call completePlatformAudit(...) with the outcome after.",
    ).toEqual([]);
  });

  it("only the listed wrappers import a write primitive inside src/lib", () => {
    const wrappers = files
      .filter(({ file }) => file.startsWith("src/lib/"))
      .filter(({ file }) => !Object.values(SAP_WRITING_HELPERS).includes(file) || WRAPPERS[file])
      .filter(({ src }) => sapWritingHelpersImported(src).length > 0)
      .map(({ file }) => file)
      .sort();

    expect(
      wrappers,
      "A lib module imports a SAP write primitive. It is a new SAP-writing helper: add the function it exports to\n" +
        "SAP_WRITING_HELPERS and the module to WRAPPERS, so every route that calls it must be audited.",
    ).toEqual(Object.keys(WRAPPERS).sort());

    for (const [file, exported] of Object.entries(WRAPPERS)) {
      for (const helper of exported) expect(SAP_WRITING_HELPERS[helper], `${file} exports ${helper}`).toBe(file);
    }
  });

  it("every non-GET request to SAP is classified", () => {
    const counted: Record<string, number> = {};
    for (const { file, src } of files) {
      if (!SAP_CLIENT_DIRS.some((d) => file.startsWith(`${d}/`))) continue;
      const code = stripSource(src, "comments");
      const n = [...code.matchAll(/\bmethod\s*:\s*["'](POST|PUT|PATCH|MERGE|DELETE)["']/gi)].length;
      if (n > 0) counted[file] = n;
    }
    const pinned = Object.fromEntries(Object.entries(NON_GET_REQUESTS).map(([f, v]) => [f, v.count]));

    expect(
      counted,
      "A module that talks to SAP gained or lost a non-GET request. If it changes SAP data, export it as a\n" +
        "SAP-writing helper (SAP_WRITING_HELPERS) so its routes must be audited; if it is a token exchange or\n" +
        "another request that changes nothing in SAP, say so in NON_GET_REQUESTS.",
    ).toEqual(pinned);
  });
});
