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
 *   1. ROUTES. Any file outside src/lib that imports a helper in
 *      `SAP_WRITING_HELPERS` must import the platform audit, await
 *      `beginPlatformAudit(` before the helper is first called, stop if that
 *      throws, and call `completePlatformAudit(` after it. "Stop" is checked:
 *      every `catch` around the begin must END by returning
 *      `platformAuditUnavailable()` or rethrowing. An empty catch, a logging
 *      one, or a `.catch()` on the promise is the fail-open shape the old
 *      write-test had — the route would go on to call SAP with no row.
 *   2. WRAPPERS. A new lib module that wraps a write primitive would be a new
 *      helper the route check does not know about. So the lib modules allowed
 *      to import a primitive are listed, each with the helper it exports; a new
 *      one fails until it is added — which puts its export under layer 1. A
 *      re-export (`export { x as y } from`, `export * from`) is an import here:
 *      a barrel that hands a primitive on under another name is a wrapper.
 *   3. THE WRITE PRIMITIVES THEMSELVES. A new function that sends POST, PUT,
 *      PATCH, MERGE or DELETE to SAP would be invisible to both layers above.
 *      So the non-GET requests in the modules that talk to SAP are counted and
 *      each one is classified. A new one fails until someone says what it is.
 *
 * IMPORTS ARE RESOLVED TO FILES, not compared as text: `@/lib/x`, `./x` and
 * `../../lib/x` from the importing file all name the same module, as does a
 * folder's `index.ts`. A check that only understood `@/` passed a route that
 * reached the helper by a relative path. And as a backstop for import shapes
 * this parser does not know, any file that NAMES a helper in code must reach it
 * through an import the check resolved.
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
const AUDIT_HOME = "src/lib/audit/platform-audit.ts";

type SourceFile = { file: string; src: string };

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
 * The names a source file imports, mapped to the specifier each came from.
 * Aliases resolve to the ORIGINAL name (`import { a as b }` imports `a`), and a
 * namespace or dynamic import of a module is recorded as `*` — it can reach
 * every helper that module exports. A re-export counts as an import: the module
 * holds the helper, and hands it on.
 */
function importsOf(src: string): Array<{ name: string; from: string }> {
  const code = stripSource(src, "comments");
  const found: Array<{ name: string; from: string }> = [];
  const named = (list: string, from: string) => {
    for (const part of list.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (name) found.push({ name, from });
    }
  };
  // import { a, b as c } from "m" · import d, { a } from "m" · import type { a } from "m"
  for (const m of code.matchAll(/\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    named(m[1]!, m[2]!);
  }
  // export { a, b as c } from "m"
  for (const m of code.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    named(m[1]!, m[2]!);
  }
  // import * as ns from "m" · import d, * as ns from "m" · export * from "m" · export * as ns from "m"
  for (const m of code.matchAll(
    /\b(?:import\s+(?:[\w$]+\s*,\s*)?\*\s+as\s+[\w$]+|export\s+\*(?:\s+as\s+[\w$]+)?)\s+from\s*["']([^"']+)["']/g,
  )) {
    found.push({ name: "*", from: m[1]! });
  }
  // import("m") · require("m")
  for (const m of code.matchAll(/\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ name: "*", from: m[1]! });
  }
  return found;
}

/**
 * Whether `specifier`, written in the repo file `importer`, names the module
 * file `home`. `@/` maps to src/; a relative path resolves against the
 * importing file's folder; either may name the file or its folder's index. A
 * package specifier names no repo file.
 */
function namesModule(specifier: string, importer: string, home: string): boolean {
  let target: string;
  if (specifier.startsWith("@/")) target = `src/${specifier.slice(2)}`;
  else if (/^\.\.?(\/|$)/.test(specifier)) target = path.posix.join(path.posix.dirname(importer), specifier);
  else return false;
  target = target.replace(/\/$/, "").replace(/\.(?:[cm]?[jt]sx?)$/, "");
  const bare = home.replace(/\.tsx?$/, "");
  return target === bare || `${target}/index` === bare;
}

/** Which SAP-writing helpers the repo file `file` can reach through its imports. */
function sapWritingHelpersImported(src: string, file: string): string[] {
  const helpers = new Set<string>();
  for (const { name, from } of importsOf(src)) {
    for (const [helper, home] of Object.entries(SAP_WRITING_HELPERS)) {
      if (!namesModule(from, file, home)) continue;
      if (name === helper || name === "*") helpers.add(helper);
    }
  }
  return [...helpers].sort();
}

/**
 * The helpers a file names in code without an import this check resolved to
 * the helper's home: a `require` of a barrel, an import shape the parser above
 * does not know, a helper taken from a module that re-exports it under its own
 * name. Each is a way to reach SAP that the layers cannot see. The module that
 * defines a helper is the one file allowed to name it unimported.
 */
function unresolvedHelperMentions(src: string, file: string): string[] {
  const named = Object.keys(SAP_WRITING_HELPERS).filter((h) => SAP_WRITING_HELPERS[h] !== file && src.includes(h));
  if (named.length === 0) return [];
  const code = stripSource(src, "comments-and-strings");
  const reached = new Set(sapWritingHelpersImported(src, file));
  return named.filter((h) => !reached.has(h) && new RegExp(`\\b${h}\\b`).test(code)).sort();
}

/** The index just past the bracket that closes the one at `open`. */
function closing(code: string, open: number): number {
  const close = code[open] === "(" ? ")" : "}";
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === code[open]) depth++;
    else if (code[i] === close && --depth === 0) return i + 1;
  }
  return code.length;
}

/** The `{` of every block that encloses `at`, innermost first. */
function enclosingBlocks(code: string, at: number): number[] {
  const open: number[] = [];
  for (let i = 0; i < at; i++) {
    if (code[i] === "{") open.push(i);
    else if (code[i] === "}") open.pop();
  }
  return open.reverse();
}

/**
 * A catch body that stops the route: its LAST statement, unconditionally,
 * returns `platformAuditUnavailable()` or rethrows. Statements before it (a log
 * line) are fine; `if (x) return platformAuditUnavailable();` is not — the
 * character before `return` must end a statement or open the block.
 */
const FAIL_CLOSED_CATCH = /(?:^|[;{}])\s*(?:return\s+platformAuditUnavailable\s*\([^)]*\)|throw\b[^;{}]*)\s*;?\s*$/;

/**
 * Whether the `await beginPlatformAudit(` at `at` (whose call ends at
 * `callEnd`) has its failure swallowed: a `.catch` / `.then` on the promise, or
 * an enclosing `try` whose `catch` does not end the route. Stricter than
 * fail-closed strictly needs, on purpose: one catch for the audit AND the SAP
 * call would have to tell the two failures apart, and the route says which one
 * it was with the 503.
 */
function swallowsBeginFailure(code: string, at: number, callEnd: number): boolean {
  if (/^\s*\.\s*(?:catch|then)\b/.test(code.slice(callEnd))) return true;
  for (const brace of enclosingBlocks(code, at)) {
    if (!/\btry\s*$/.test(code.slice(Math.max(0, brace - 16), brace))) continue;
    const tryEnd = closing(code, brace);
    const handler = /^\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(code.slice(tryEnd));
    if (!handler) continue; // try/finally: the error still propagates
    const bodyOpen = tryEnd + handler[0].length - 1;
    const body = code.slice(bodyOpen + 1, closing(code, bodyOpen) - 1).trim();
    if (!FAIL_CLOSED_CATCH.test(body)) return true;
  }
  return false;
}

/**
 * Why a file that imports a SAP-writing helper is not audited, or [] if it is.
 * Pure, so the check itself can be tested on sources written to fail it.
 */
function auditFindings(src: string, file: string): string[] {
  const helpers = sapWritingHelpersImported(src, file);
  if (helpers.length === 0) return [];

  const findings: string[] = [];
  const imports = importsOf(src);
  for (const fn of ["beginPlatformAudit", "completePlatformAudit"]) {
    if (!imports.some((i) => i.name === fn && namesModule(i.from, file, AUDIT_HOME))) {
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

  const begins = [...code.matchAll(/\bawait\s+beginPlatformAudit\s*\(/g)];
  if (begins.length === 0) {
    findings.push("never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route");
  } else if (begins[0]!.index > firstCall) {
    findings.push("calls SAP before beginPlatformAudit( — the row must be written BEFORE SAP is called");
  }
  if (begins.some((b) => swallowsBeginFailure(code, b.index, closing(code, b.index + b[0].length - 1)))) {
    findings.push(
      "swallows a beginPlatformAudit( failure — its catch must end with `return platformAuditUnavailable()` or rethrow," +
        " or the route goes on to call SAP with no row",
    );
  }
  const complete = /\bcompletePlatformAudit\s*\(/g;
  let completesAfter = false;
  for (let m = complete.exec(code); m; m = complete.exec(code)) {
    if (m.index > firstCall) completesAfter = true;
  }
  if (!completesAfter) findings.push("never calls completePlatformAudit( after the SAP call — the outcome is not recorded");
  return findings;
}

/** The lib modules that import a SAP-writing helper — each one a wrapper, listed or not. */
function libModulesImportingAHelper(files: SourceFile[]): string[] {
  return files
    .filter(({ file }) => file.startsWith("src/lib/"))
    .filter(({ file }) => !Object.values(SAP_WRITING_HELPERS).includes(file) || WRAPPERS[file])
    .filter(({ file, src }) => sapWritingHelpersImported(src, file).length > 0)
    .map(({ file }) => file)
    .sort();
}

describe("the coverage check itself", () => {
  // A static check that silently passes what it cannot read reports success
  // forever. These sources are written to fail it.
  const ROUTE = "src/app/api/sap/tdd/new/route.ts";
  const header = `import { createSapEntitySetRecord } from "@/lib/sap-public/tdd-connector";\n`;
  const audit = `import { beginPlatformAudit, completePlatformAudit, platformAuditUnavailable } from "@/lib/audit/platform-audit";\n`;
  const SWALLOWED = "swallows a beginPlatformAudit( failure — its catch must end with `return platformAuditUnavailable()` or rethrow, or the route goes on to call SAP with no row";

  /** A route body that awaits the row inside a try whose catch is `handler`. */
  const routeWithCatch = (handler: string) => `${header}${audit}export async function POST() {
      let a;
      try {
        a = await beginPlatformAudit({});
      } catch ${handler}
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;

  it("fails a route that writes to SAP with no audit at all", () => {
    expect(auditFindings(`${header}export async function POST() { await createSapEntitySetRecord(); }`, ROUTE)).toEqual([
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
    expect(auditFindings(src, ROUTE)).toEqual([
      "calls SAP before beginPlatformAudit( — the row must be written BEFORE SAP is called",
    ]);
  });

  it("fails a route that fires the row without awaiting it", () => {
    const src = `${header}${audit}export async function POST() {
      void beginPlatformAudit({});
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(src, ROUTE)).toContain(
      "never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route",
    );
  });

  it("is not satisfied by a call that exists only in a comment", () => {
    const src = `${header}${audit}export async function POST() {
      // await beginPlatformAudit(input) — TODO
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(src, ROUTE)).toContain(
      "never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route",
    );
  });

  it("fails a route that swallows a failed audit insert and writes anyway (fail-open)", () => {
    // The shape the old write-test had: the audit is "best-effort".
    expect(auditFindings(routeWithCatch("{ /* audit is best-effort */ }"), ROUTE)).toEqual([SWALLOWED]);
    expect(auditFindings(routeWithCatch("(e) { console.error(e); }"), ROUTE)).toEqual([SWALLOWED]);
    expect(auditFindings(routeWithCatch("(e) { if (strict) return platformAuditUnavailable(); }"), ROUTE)).toEqual([
      SWALLOWED,
    ]);
    // Swallowed on the promise rather than by a try.
    const chained = `${header}${audit}export async function POST() {
      const a = await beginPlatformAudit({}).catch(() => null);
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(chained, ROUTE)).toEqual([SWALLOWED]);
    // An outer try that swallows is as bad as an inner one.
    const outer = `${header}${audit}export async function POST() {
      let a;
      try {
        try { a = await beginPlatformAudit({}); } catch (e) { throw e; }
      } catch { log("audit down"); }
      const r = await createSapEntitySetRecord();
      await completePlatformAudit(a, r);
    }`;
    expect(auditFindings(outer, ROUTE)).toEqual([SWALLOWED]);
  });

  it("passes a catch that ends the route — after a log line, or by rethrowing", () => {
    expect(auditFindings(routeWithCatch("{ return platformAuditUnavailable(); }"), ROUTE)).toEqual([]);
    expect(auditFindings(routeWithCatch("(e) { console.error(e); return platformAuditUnavailable(); }"), ROUTE)).toEqual(
      [],
    );
    expect(auditFindings(routeWithCatch("(e) { throw e; }"), ROUTE)).toEqual([]);
  });

  it("sees through an alias and a namespace import", () => {
    expect(
      sapWritingHelpersImported(
        `import { runCapabilityWriteTest as go } from "@/lib/sap-public/capability-write-test";`,
        ROUTE,
      ),
    ).toEqual(["runCapabilityWriteTest"]);
    expect(sapWritingHelpersImported(`import * as sap from "@/lib/sap-public/tdd-connector";`, ROUTE)).toEqual([
      "createSapEntitySetRecord",
      "deleteSapEntityByLocation",
    ]);
    expect(
      sapWritingHelpersImported(`import sap, { createSapEntitySetRecord } from "@/lib/sap-public/tdd-connector";`, ROUTE),
    ).toEqual(["createSapEntitySetRecord"]);
  });

  it("resolves a relative import against the importing file", () => {
    const relative = `import { createSapEntitySetRecord } from "../../../../../lib/sap-public/tdd-connector";\n`;
    expect(sapWritingHelpersImported(relative, ROUTE)).toEqual(["createSapEntitySetRecord"]);
    expect(auditFindings(`${relative}export async function POST() { await createSapEntitySetRecord(); }`, ROUTE)).toContain(
      "never awaits beginPlatformAudit( — the row must be written, and its failure must stop the route",
    );
    // The convention inside lib/sap-public itself.
    expect(
      sapWritingHelpersImported(`import { deleteSapEntityByLocation } from "./tdd-connector";`, "src/lib/sap-public/bulk.ts"),
    ).toEqual(["deleteSapEntityByLocation"]);
    // The same relative path from a different folder names a different file.
    expect(sapWritingHelpersImported(`import { createSapEntitySetRecord } from "./tdd-connector";`, ROUTE)).toEqual([]);
  });

  it("treats a re-export as an import, so a barrel is a wrapper", () => {
    const barrels: SourceFile[] = [
      {
        file: "src/lib/sap-public/writes.ts",
        src: `export { createSapEntitySetRecord as createRecord } from "./tdd-connector";`,
      },
      { file: "src/lib/sap-public/all.ts", src: `export * from "@/lib/sap-public/tdd-connector";` },
      { file: "src/lib/sap-public/bulk-write.ts", src: `import { createSapEntitySetRecord } from "./tdd-connector";` },
      { file: "src/lib/sap-public/reads.ts", src: `export { getSapTenant } from "./tdd-connector";` },
    ];
    expect(libModulesImportingAHelper(barrels)).toEqual([
      "src/lib/sap-public/all.ts",
      "src/lib/sap-public/bulk-write.ts",
      "src/lib/sap-public/writes.ts",
    ]);
  });

  it("flags a file that names a helper it does not visibly import", () => {
    // Taken from a barrel that re-exports it: the route's import resolves to
    // the barrel, not to the helper's home.
    const fromBarrel = `import { createSapEntitySetRecord } from "@/lib/sap-public/writes";
      export async function POST() { await createSapEntitySetRecord(); }`;
    expect(unresolvedHelperMentions(fromBarrel, ROUTE)).toEqual(["createSapEntitySetRecord"]);
    // Named only in a comment or a string: not a reach.
    expect(unresolvedHelperMentions(`// see createSapEntitySetRecord\nconst s = "runCapabilityWriteTest";`, ROUTE)).toEqual(
      [],
    );
    // The helper's own module defines it.
    expect(
      unresolvedHelperMentions("export async function createSapEntitySetRecord() {}", SAP_WRITING_HELPERS.createSapEntitySetRecord!),
    ).toEqual([]);
  });

  it("passes a route that awaits the row first, stops if it fails and records the outcome after", () => {
    expect(auditFindings(routeWithCatch("{ return platformAuditUnavailable(); }"), ROUTE)).toEqual([]);
  });

  it("ignores a file that imports no SAP-writing helper", () => {
    expect(auditFindings(`import { getSapTenant } from "@/lib/sap-public/tdd-connector";`, ROUTE)).toEqual([]);
  });
});

describe("every SAP write outside the broker is audited before SAP is called (P0.7)", () => {
  const files: SourceFile[] = walk(path.join(ROOT, "src")).map((f) => ({
    file: repoPath(f, ROOT),
    src: readFileSync(f, "utf8"),
  }));

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
      .filter(({ file, src }) => sapWritingHelpersImported(src, file).length > 0)
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
      .map(({ file, src }) => ({ file, findings: auditFindings(src, file) }))
      .filter((o) => o.findings.length > 0);

    expect(
      offenders,
      "These change data in SAP without the platform audit row (lib/audit/platform-audit.ts):\n" +
        offenders.map((o) => `  ${o.file}\n    - ${o.findings.join("\n    - ")}`).join("\n") +
        "\nAwait beginPlatformAudit(...) before the SAP call and return platformAuditUnavailable() if it throws;" +
        " call completePlatformAudit(...) with the outcome after.",
    ).toEqual([]);
  });

  it("no file names a SAP-writing helper the check cannot trace to its import", () => {
    const blind = files
      .map(({ file, src }) => ({ file, helpers: unresolvedHelperMentions(src, file) }))
      .filter((b) => b.helpers.length > 0);

    expect(
      blind,
      "These name a SAP-writing helper but do not import it from the module that defines it, so the audit check\n" +
        "cannot see them. Import it from its home (SAP_WRITING_HELPERS) with an `@/` or relative path.",
    ).toEqual([]);
  });

  it("only the listed wrappers import a write primitive inside src/lib", () => {
    expect(
      libModulesImportingAHelper(files),
      "A lib module imports or re-exports a SAP write primitive. It is a new SAP-writing helper: add the function it\n" +
        "exports to SAP_WRITING_HELPERS and the module to WRAPPERS, so every route that calls it must be audited.",
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
