/**
 * Every binding refusal is either counted or deliberately excluded.
 *
 * TWO DEFECTS, ONE SHAPE — a failure that happens and is not counted.
 *
 * 1. The ops query filtered on an inline `["NO_MATCH_FOR_ENVIRONMENT",
 *    "AMBIGUOUS"]`. When the resolver gained NO_MATCH_FOR_CLIENT — so a
 *    credential could name the SAP client it may read — that array was not
 *    updated. A credential bound to a client no connection carries failed
 *    every call while the CRITICAL `binding-refused` rule reported zero.
 *
 * 2. The northbound WRITE route never recorded `bindingRefusal` at all. Every
 *    write refusal audited as a bare 403 with a null reason, so the same rule
 *    had only ever seen READS. A write-only integration could fail
 *    indefinitely with the console reporting no incidents.
 *
 * Both are the exact failure the rule's own header warns about: "A detector
 * outliving the defect it was built for is worse than no detector, because it
 * occupies the space where a real one would go." Here it was worse still —
 * the detector was live, trusted, and blind.
 *
 * These tests make the drift impossible rather than fixing one instance:
 * adding a refusal reason without classifying it fails the first test, and
 * dropping the write path's reason fails the last.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BINDING_REFUSAL_COVERAGE,
  COUNTED_BINDING_REFUSALS,
} from "@/lib/ops/incidents";

const SRC = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

describe("coverage is complete against the resolver's own union", () => {
  it("classifies every ConnectionBindingFailure the resolver can return", () => {
    /*
     * Read from the resolver source, not from a hand-copied list — a copy
     * would drift in exactly the way this test exists to prevent. The union
     * is a TypeScript type, so it has no runtime value to import.
     */
    const src = SRC("src/lib/sap-public/connection-resolver.ts");
    const union = src.slice(
      src.indexOf("export type ConnectionBindingFailure"),
      src.indexOf(";", src.indexOf("export type ConnectionBindingFailure")),
    );
    const reasons = [...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);

    expect(reasons.length).toBeGreaterThanOrEqual(5);
    for (const reason of reasons) {
      expect(
        BINDING_REFUSAL_COVERAGE,
        `${reason} is a refusal the resolver returns but nothing decided whether to count it`,
      ).toHaveProperty(reason);
    }
    // And nothing classified that the resolver cannot actually produce.
    for (const key of Object.keys(BINDING_REFUSAL_COVERAGE)) {
      expect(reasons, `${key} is classified but the resolver never returns it`).toContain(key);
    }
  });

  it("counts the five that mean a live credential fails every call", () => {
    // CONNECTION_UNREADABLE joined when the resolver learned to refuse (rather
    // than crash on) a row whose secrets fail to open — same shape as the
    // other three: live credential, approved grant, every call fails on
    // estate state an operator must fix.
    expect(COUNTED_BINDING_REFUSALS.sort()).toEqual(
      ["AMBIGUOUS", "CONNECTION_UNREADABLE", "NO_MATCH_FOR_CLIENT", "NO_MATCH_FOR_ENVIRONMENT", "UNKNOWN_PRODUCT"].sort(),
    );
  });

  it("excludes the two that belong to a different rule or to 'not started'", () => {
    expect(BINDING_REFUSAL_COVERAGE.NO_CONNECTION).toBe("excluded");
    expect(BINDING_REFUSAL_COVERAGE.UNDECLARED_ENVIRONMENT_WRITE).toBe("excluded");
  });
});

describe("the query uses the derived list, not its own copy", () => {
  it("the ops route filters on COUNTED_BINDING_REFUSALS", () => {
    const src = SRC("src/app/api/ops/incidents/route.ts");
    expect(src).toMatch(/bindingRefusal:\s*\{\s*in:\s*COUNTED_BINDING_REFUSALS\s*\}/);
    // The inline array is what drifted; it must not come back.
    expect(src).not.toMatch(/bindingRefusal:\s*\{\s*in:\s*\[/);
  });
});

describe("both northbound paths record the reason", () => {
  it.each([
    ["read", "src/app/api/northbound/interfaces/[id]/data/route.ts"],
    ["write", "src/app/api/northbound/interfaces/[id]/data/write/route.ts"],
  ])("the %s route passes binding.reason to the audit", (_label, file) => {
    /*
     * The write route is the one that was missing. A detector counting a
     * column nobody writes reports zero forever, and zero is what a healthy
     * system also reports — which is why this went unseen.
     */
    expect(SRC(file)).toMatch(/binding\.reason/);
  });

  it("the audit writer actually persists the field", () => {
    expect(SRC("src/lib/northbound/audit.ts")).toMatch(/bindingRefusal:\s*input\.bindingRefusal/);
  });
});
