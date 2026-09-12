/**
 * The status vocabulary is complete, closed, and honest about its gaps (PR-2).
 *
 * THE PROPERTY THAT MATTERS: no status literal the codebase already speaks can
 * reach a CoreEdge screen without someone having decided what it means. The
 * audit found 87 of them across at least four spelling conventions, mapped to
 * colour in nine different components. This file fails when the 88th arrives and
 * nobody says what it is.
 *
 * A mapping to `null` counts as decided, not as missing — several literals
 * genuinely are not lane statuses (environments, operations, audit action names)
 * and forcing them onto one of the eighteen would print a false claim on a chip.
 * So `null` is held to the same standard as any other answer: it has to explain
 * itself, and the test checks that it does.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  APP_CHIP_GLYPHS,
  APP_STATUSES,
  APP_STATUS_VOCABULARY,
  GATE_GLYPHS,
  GATE_TOKENS,
  LANE_HOPS,
  LANE_STATUSES,
  LANE_STATUS_VOCABULARY,
  STATUS_LITERAL_MAP,
  appChipTextFor,
  chipTextFor,
  glyphFor,
  laneStatusForLiteral,
  type LaneStatus,
} from "@/lib/coreedge/status-vocabulary";

const ROOT = process.cwd();

describe("the eighteen", () => {
  it("is exactly eighteen — the handoff's own count", () => {
    // "Eighteen statuses, five tokens." If this changes, the design changed.
    expect(LANE_STATUSES).toHaveLength(18);
  });

  it("has no duplicate labels", () => {
    const labels = LANE_STATUSES.map((s) => LANE_STATUS_VOCABULARY[s].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("uses only the five gate tokens", () => {
    for (const s of LANE_STATUSES) {
      expect(GATE_TOKENS).toContain(LANE_STATUS_VOCABULARY[s].token);
    }
  });

  it("names a broken hop that is one of the six, or none at all", () => {
    for (const s of LANE_STATUSES) {
      const hop = LANE_STATUS_VOCABULARY[s].brokenHop;
      if (hop !== null) expect(LANE_HOPS).toContain(hop);
    }
  });

  it("declares no 'checking' status", () => {
    /*
     * The handoff is explicit: "there is no 'checking' status — that would be a
     * nineteenth vocabulary entry for a transient." A lane keeps its last known
     * status while a re-check runs, which is the same rule as "loading never
     * blanks a known state".
     */
    const labels = LANE_STATUSES.map((s) => LANE_STATUS_VOCABULARY[s].label.toLowerCase());
    for (const forbidden of ["checking", "loading", "pending", "refreshing"]) {
      expect(labels).not.toContain(forbidden);
    }
  });

  it("keeps 401 and 403 apart, because they have different owners", () => {
    // The handoff's stated reason the vocabulary is this size at all.
    const signIn = LANE_STATUS_VOCABULARY.signInRefused;
    const refused = LANE_STATUS_VOCABULARY.sapRefused;
    expect(signIn.owner).toBe("platformAdmin");
    expect(refused.owner).toBe("clientSapAdmin");
    expect(signIn.brokenHop).not.toBe(refused.brokenHop);
  });

  it("keeps Access ended apart from No access, because one of them renews", () => {
    expect(LANE_STATUS_VOCABULARY.accessEnded.means).toContain("renewing keeps it");
    expect(LANE_STATUS_VOCABULARY.noAccess.means).not.toContain("renew");
  });
});

describe("the glyph contract", () => {
  /*
   * PR-1 measured why this is a contract: in dark mode the fifteen pairwise
   * contrasts between the six status grounds sit between 1.01:1 and 1.10:1.
   * Colour alone does not distinguish them for anyone.
   */
  it("gives every gate token a glyph", () => {
    for (const token of GATE_TOKENS) {
      expect(GATE_GLYPHS[token], `no glyph for ${token}`).toBeTruthy();
    }
  });

  it("gives every one of the eighteen a non-empty glyph", () => {
    for (const s of LANE_STATUSES) {
      expect(glyphFor(s), `no glyph for ${s}`).toBeTruthy();
    }
  });

  it("puts the glyph in front of the label, every time", () => {
    for (const s of LANE_STATUSES) {
      expect(chipTextFor(s)).toBe(`${glyphFor(s)} ${LANE_STATUS_VOCABULARY[s].label}`);
    }
  });

  it("uses the five glyphs the handoff names and no others", () => {
    expect(new Set(Object.values(GATE_GLYPHS))).toEqual(new Set(["✓", "i", "…", "✕", "–"]));
  });

  it("distinguishes the four failure-ish tokens by glyph, not only by colour", () => {
    // The whole point: two statuses that differ must not read identically in
    // greyscale.
    const glyphs = GATE_TOKENS.map((t) => GATE_GLYPHS[t]);
    expect(new Set(glyphs).size).toBe(GATE_TOKENS.length);
  });

  it("gives the app-level status-expired token a glyph too", () => {
    // Invented — the design specifies glyphs for the five gate tokens only. It
    // is flagged in the source; this asserts it exists rather than that it is
    // blessed.
    expect(APP_CHIP_GLYPHS["status-expired"]).toBeTruthy();
    for (const s of APP_STATUSES) {
      expect(appChipTextFor(s).length).toBeGreaterThan(1);
    }
  });
});

describe("all 87 literals the audit found", () => {
  /**
   * VENDORED ON PURPOSE, and this is the second version of this test.
   *
   * The first read the list from `docs/coreedge/audit/audit.json` and fell back
   * to `expect(STATUS_LITERAL_MAP).toHaveLength(87)` when the file was absent —
   * which it is, because the audit lives on its own branch until it merges. That
   * fallback passed while the table was genuinely wrong: it had 87 entries, one
   * literal mapped twice across two domains, and `ERROR` missing altogether. A
   * count cannot tell those apart, so it was measuring the wrong thing.
   *
   * The list below is transcribed from the audit's own `statuses[].literal`, in
   * its order. The assertion against the real file still runs when the file is
   * there, so if the two ever disagree the test says so rather than choosing.
   */
  const AUDIT_LITERALS: readonly string[] = [
  "ACTIVATED",
  "NEEDS_SETUP",
  "AVAILABLE",
  "NOT_PROBEABLE",
  "PROBE_FAILED",
  "REFERENCE",
  "NOT_CHECKED",
  "NOT_FOUND",
  "DRAFT",
  "ACTIVE",
  "RESTRICTED",
  "RETIRED",
  "DRAFT (interface)",
  "ACTIVE (interface)",
  "DEPRECATED",
  "REQUESTED",
  "APPROVED",
  "SANDBOX_ONLY",
  "READ_ONLY",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
  "OK",
  "UNAUTHORIZED",
  "TIMEOUT",
  "ERROR",
  "NO_PROBE_PATH",
  "NEVER_TESTED",
  "Healthy",
  "Needs attention",
  "Unknown",
  "Reachable",
  "never returned 200",
  "draft",
  "sent",
  "awaiting_signoff",
  "signed",
  "expired",
  "revoked",
  "superseded",
  "good",
  "attention",
  "bad",
  "neutral",
  "info",
  "muted",
  "critical",
  "major",
  "minor",
  "CURRENT",
  "STALE",
  "NEVER_IMPORTED",
  "OK (read)",
  "EMPTY",
  "NEEDS_SETUP (read)",
  "NOT_FOUND (read)",
  "TIMEOUT (read)",
  "ERROR (read)",
  "CREATED",
  "NEEDS_SETUP (write)",
  "NOT_FOUND (write)",
  "REJECTED (write)",
  "TIMEOUT (write)",
  "ERROR (write)",
  "PASS",
  "FAIL",
  "NOT_RUN",
  "data",
  "empty",
  "needs_setup",
  "error",
  "SANDBOX",
  "DEV",
  "TEST",
  "PROD",
  "READ",
  "CREATE",
  "UPDATE",
  "WRITE",
  "cron",
  "manual",
  "test",
  "CREATE (audit)",
  "UPDATE (audit)",
  "PROMOTE",
  "DECISION",
  "TEST_CONNECT",
  ];

  const AUDIT = path.resolve(ROOT, "docs/coreedge/audit/audit.json");

  function auditLiteralsFromFile(): string[] | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(AUDIT, "utf8"));
      if (typeof parsed !== "object" || parsed === null) return null;
      const statuses = (parsed as { statuses?: unknown }).statuses;
      if (!Array.isArray(statuses)) return null;
      return statuses.map((s) => String((s as { literal?: unknown }).literal));
    } catch {
      return null;
    }
  }

  it("has 87 of them, which is what the audit counted", () => {
    expect(AUDIT_LITERALS).toHaveLength(87);
    expect(new Set(AUDIT_LITERALS).size).toBe(87);
  });

  it("still matches the audit file, whenever the audit file is present", () => {
    const fromFile = auditLiteralsFromFile();
    if (fromFile === null) return; // audit branch not merged yet
    expect(fromFile).toEqual([...AUDIT_LITERALS]);
  });

  it("is mapped, every one, with nothing left over", () => {
    const mapped = new Set(STATUS_LITERAL_MAP.map((m) => m.literal));

    const unmapped = AUDIT_LITERALS.filter((l) => !mapped.has(l));
    expect(
      unmapped,
      "These status literals exist in the codebase and this file does not say " +
        "what they mean. Add each to STATUS_LITERAL_MAP — with a lane status, or " +
        "with null and a note saying why it is not a lane chip:\n" + unmapped.join("\n"),
    ).toEqual([]);

    const invented = [...mapped].filter((l) => !AUDIT_LITERALS.includes(l));
    expect(
      invented,
      "Mapped, but the audit never found it in the codebase. Either the audit is " +
        "stale or this entry is imaginary:\n" + invented.join("\n"),
    ).toEqual([]);
  });

  it("maps a literal more than once only when it genuinely means two things", () => {
    /*
     * The audit deduplicated by spelling, so one of its rows can be two
     * different statuses. NOT_FOUND is both a capability-catalogue badge and a
     * connection-probe outcome (src/lib/studio/connection-health.ts:34). Splits
     * like that are allowed; a split with the same domain twice is a duplicate.
     */
    const byLiteral = new Map<string, string[]>();
    for (const m of STATUS_LITERAL_MAP) {
      byLiteral.set(m.literal, [...(byLiteral.get(m.literal) ?? []), m.domain]);
    }
    for (const [literal, domains] of byLiteral) {
      expect(new Set(domains).size, `${literal} is mapped twice in one domain`).toBe(
        domains.length,
      );
    }
    expect(byLiteral.get("NOT_FOUND")).toEqual(["catalogueBadge", "connectionHealth"]);
  });

  it("maps each literal exactly once per domain", () => {
    const keys = STATUS_LITERAL_MAP.map((m) => `${m.domain}::${m.literal}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves every mapped lane to one of the eighteen", () => {
    for (const m of STATUS_LITERAL_MAP) {
      if (m.lane !== null) expect(LANE_STATUSES).toContain(m.lane);
    }
  });

  it("makes every null explain itself", () => {
    /*
     * A null that says nothing is indistinguishable from a literal nobody got to.
     * The note is what turns "unmapped" into "decided".
     */
    for (const m of STATUS_LITERAL_MAP) {
      expect(m.note.length, `${m.literal} (${m.domain}) has no note`).toBeGreaterThan(20);
    }
  });

  it("tells 'never heard of it' apart from 'deliberately not a chip'", () => {
    // undefined and null are different answers and callers must be able to act
    // on the difference.
    expect(laneStatusForLiteral("EMPTY", "readResult")).toBe("noData");
    expect(laneStatusForLiteral("SANDBOX", "environment")).toBeNull();
    expect(laneStatusForLiteral("NO_SUCH_STATUS_ANYWHERE")).toBeUndefined();
  });

  it("disambiguates literals that share a spelling across domains", () => {
    // `expired` is an assessment sign-off state; `EXPIRED` is a grant decision.
    // They are unrelated, and a lookup without a domain must not conflate them.
    expect(laneStatusForLiteral("EXPIRED", "grantDecision")).toBe("accessEnded");
    expect(laneStatusForLiteral("expired", "signoffLifecycle")).toBeNull();
  });
});

describe("what the mapping reveals", () => {
  /*
   * These two assertions are findings pinned as tests. Neither is a defect in
   * this file — both are facts about the gap between the design and the running
   * system, and both should fail the day that gap closes, so someone comes back
   * and updates the story.
   */

  it("leaves seven of the eighteen with no backend literal behind them", () => {
    const reachable = new Set(
      STATUS_LITERAL_MAP.map((m) => m.lane).filter((l): l is LaneStatus => l !== null),
    );
    const unreachable = LANE_STATUSES.filter((s) => !reachable.has(s));

    /*
     * These are the statuses the designs render that nothing in the current
     * backend can produce. Every one of them is a PR-5 capability: rate
     * limiting, the environment binding rules, deliberate deactivation, the
     * circuit breaker, and the key lifecycle behind No key. Until those land,
     * these chips can only ever be shown from fixtures — which is exactly what
     * the handoff's section 6 says.
     */
    expect(unreachable.sort()).toEqual(
      [
        "bindingRefused",
        "circuitOpen",
        "noKey",
        "noSapSystem",
        "rateLimited",
        "secretUnreadable",
        "systemOff",
      ].sort(),
    );
  });

  it("records the four literals the eighteen cannot express", () => {
    /*
     * GAPS, kept visible. Three domains spell a 404 and one spells a business-
     * rule write rejection; the vocabulary has a chip for neither, and the
     * nearest chips would send the user to the wrong person. A6 already carries
     * the 404 copy, so the words exist and the status does not.
     */
    const gaps = STATUS_LITERAL_MAP.filter((m) => m.note.startsWith("GAP")).map(
      (m) => `${m.domain}::${m.literal}`,
    );
    expect(gaps.sort()).toEqual(
      [
        "catalogueBadge::NOT_FOUND",
        "connectionHealth::NOT_FOUND",
        "interfaceStatus::DEPRECATED",
        "readResult::NOT_FOUND (read)",
        "writeResult::NOT_FOUND (write)",
        "writeResult::REJECTED (write)",
      ].sort(),
    );
  });
});

describe("app statuses are not lane statuses (DECISION D3)", () => {
  it("renders Restricted as an app chip and never as a nineteenth lane status", () => {
    expect(APP_STATUS_VOCABULARY.restricted.label).toBe("Restricted · no new access");
    expect(APP_STATUS_VOCABULARY.restricted.token).toBe("gate-wait");
    expect(APP_STATUS_VOCABULARY.restricted.owner).toBe("platformAdmin");
    expect(LANE_STATUSES).not.toContain("restricted" as unknown as LaneStatus);
  });

  it("keeps existing lanes serving under Restricted", () => {
    // D3's substance, asserted on the words the user actually reads.
    expect(APP_STATUS_VOCABULARY.restricted.means).toContain("keep serving");
  });

  it("maps the RESTRICTED literal to no lane at all", () => {
    expect(laneStatusForLiteral("RESTRICTED", "solutionStatus")).toBeNull();
  });
});
