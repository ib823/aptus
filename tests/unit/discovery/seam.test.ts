/**
 * ABeam Workbench — the client↔consultant seam (brief §8, §9.4).
 *
 * Two properties, both structural:
 *   1. SCOPE — effective scope is engagement ∩ grant, enforced in the serializer
 *      path, not the UI.
 *   2. PRIVACY — the seam's payload cannot carry consultant-only state. Notes,
 *      the park list and consultant identity stay on the consultant side.
 *
 * PR-3 asserted the notes contract before it had a consumer. This is the pass
 * where the consumer exists, so the assertions are now load-bearing.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { effectiveStreamIds, isSessionScoped, isStreamInScope } from "@/lib/discovery/external/scope";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\*.*$/gm, "");
}

describe("effective scope = engagement ∩ grant", () => {
  it("both empty → unrestricted", () => {
    expect(effectiveStreamIds({ engagementStreamIds: [], grantStreamIds: [] })).toBeNull();
  });

  it("engagement only → the session's scope", () => {
    expect(effectiveStreamIds({ engagementStreamIds: ["VS2", "VS7"], grantStreamIds: [] })).toEqual([
      "VS2",
      "VS7",
    ]);
  });

  it("grant only → the persona's scope", () => {
    expect(effectiveStreamIds({ engagementStreamIds: [], grantStreamIds: ["VS7"] })).toEqual(["VS7"]);
  });

  it("a grant NARROWS within the session", () => {
    expect(
      effectiveStreamIds({ engagementStreamIds: ["VS2", "VS7"], grantStreamIds: ["VS7"] }),
    ).toEqual(["VS7"]);
  });

  it("a grant CANNOT widen past the session — the whole point", () => {
    // A CFO grant naming a stream the session excluded must not reach it.
    expect(
      effectiveStreamIds({ engagementStreamIds: ["VS2"], grantStreamIds: ["VS2", "VS9"] }),
    ).toEqual(["VS2"]);
  });

  it("a grant entirely outside the session sees NOTHING, not everything", () => {
    // [] and null are different: this is the case where a naive
    // `length === 0 ? all : filter` would hand over the whole library.
    expect(effectiveStreamIds({ engagementStreamIds: ["VS2"], grantStreamIds: ["VS9"] })).toEqual([]);
  });

  it("isStreamInScope honours null as unrestricted and [] as nothing", () => {
    expect(isStreamInScope("VS1", null)).toBe(true);
    expect(isStreamInScope("VS1", [])).toBe(false);
    expect(isStreamInScope("VS1", ["VS1"])).toBe(true);
  });

  it("isSessionScoped drives V1's honest note", () => {
    expect(isSessionScoped([])).toBe(false);
    expect(isSessionScoped(["VS2"])).toBe(true);
  });
});

describe("scope is enforced server-side, not in the UI", () => {
  it("the journey serializer reads scope, not raw grant ids", () => {
    const src = read("src/lib/discovery/external/journey.ts");
    expect(src).toContain("isStreamInScope");
    // The old grant-only check would let a later-invited reviewer see all 10.
    expect(stripComments(src)).not.toContain("valueStreamIds");
  });

  it("the decisions write path enforces the same effective scope", () => {
    const src = stripComments(read("src/app/(external)/d/decisions/route.ts"));
    expect(src).toContain("effectiveStreamIds");
  });

  it("the drive route refuses to project a process outside the session scope", () => {
    const src = stripComments(read("src/app/api/discovery/sessions/[id]/drive/route.ts"));
    expect(src).toContain("effectiveStreamIds");
    expect(src).toContain("out_of_scope");
  });
});

/**
 * §9.4: "Notes in C8 are private by construction; the console never mirrors them
 * to the projection."
 */
describe("the seam payload cannot carry consultant-only state", () => {
  const src = read("src/app/(external)/d/live/route.ts");
  const code = stripComments(src);

  it("the stream selects only liveAt and drivenProcessId", () => {
    // An explicit select, not the row: the payload cannot widen by accident when
    // someone adds a column to DiscoveryEngagement.
    expect(code).toMatch(/select:\s*\{\s*liveAt:\s*true,\s*drivenProcessId:\s*true\s*\}/);
  });

  it("the seam never touches the notes table", () => {
    expect(code).not.toMatch(/\b(?:prisma|tx|db)\s*\.\s*discoveryNote\b/);
  });

  it("the seam never touches decisions, grants, or product maps", () => {
    for (const table of ["discoveryDecision", "discoveryAccessGrant", "discoveryProductMap"]) {
      expect(code, `/d/live must not read ${table}`).not.toMatch(
        new RegExp(`\\b(?:prisma|tx|db)\\s*\\.\\s*${table}\\b`),
      );
    }
  });

  it("its payload type has exactly two fields", () => {
    const iface = /interface LivePayload \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";
    const fields = [...iface.matchAll(/^\s*(\w+)\s*[?:]/gm)].map((m) => m[1]);
    expect(fields.sort()).toEqual(["live", "processId"]);
  });
});

describe("the notes consumer lives on the consultant side only", () => {
  it("session.ts is the only reader of the notes table", async () => {
    const { readdirSync, statSync } = await import("fs");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(join(ROOT, "src"));

    const readers = files
      .filter((f) => /\b(?:prisma|tx|db)\s*\.\s*discoveryNote\s*\.\s*findMany\b/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(ROOT + "/", ""))
      .sort();

    /**
     * The allowlist is deliberately explicit rather than a directory rule: every
     * addition to it should cost someone a decision.
     *
     *  - workbench/session.ts — the C8 console (PR-5).
     *  - workbench/packs.ts   — the INTERNAL pack only (PR-6). buildClientPack
     *    does not touch this table; packs.test.ts asserts that separately, by
     *    scanning the function body.
     *
     * Both live under lib/discovery/workbench/, which the wall test walks against
     * every (external) entry point transitively. A reader appearing anywhere else
     * fails here.
     */
    expect(readers).toEqual([
      "src/lib/discovery/workbench/packs.ts",
      "src/lib/discovery/workbench/session.ts",
    ]);
  });

  it("the CLIENT pack builder never reads notes, even though its module does", () => {
    // packs.ts is on the allowlist above because the internal pack carries
    // notes. That is exactly the case where a module-level allowlist is too
    // coarse — so assert the client-side function itself.
    const src = read("src/lib/discovery/workbench/packs.ts");
    const fn = /export async function buildClientPack[\s\S]*?\n}\n/.exec(stripComments(src))?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toMatch(/\b(?:prisma|tx|db)\s*\.\s*discoveryNote\b/);
  });

  it("the console view model is unreachable from the client surface", () => {
    // Belt and braces with wall.test.ts: session.ts lives under
    // lib/discovery/workbench/, which the wall test walks against every
    // (external) entry point transitively.
    expect(read("src/lib/discovery/workbench/session.ts")).toContain("prisma.discoveryNote");
  });
});
