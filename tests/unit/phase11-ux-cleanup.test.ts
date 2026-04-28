/**
 * Phase 11 — UX cleanup invariants.
 *
 * Snapshots the cleanup decisions so regressions are loud:
 *   - SAP version label reads from APP_CONFIG, not a hardcoded string
 *   - Status group facade exposes 6 user-visible groups
 *   - Granularity vocabulary uses Summary/Detailed/Per-step in the UI
 *     (DB enum stays coarse/medium/fine for stability)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { APP_CONFIG } from "@/constants/config";
import { UI_TEXT } from "@/constants/ui-text";
import {
  STATUS_GROUPS,
  STATUS_GROUP_ORDER,
  STATUS_GROUP_LABELS,
  STATUS_LABELS,
} from "@/lib/assessment/status-machine";

describe("Phase 11 — SAP version centralization", () => {
  it("UI_TEXT.app.sapVersion is computed from APP_CONFIG.sapVersion", () => {
    expect(UI_TEXT.app.sapVersion).toBe(`SAP Best Practices ${APP_CONFIG.sapVersion}`);
  });

  it("ui-text.ts no longer hardcodes a version literal", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "constants", "ui-text.ts"), "utf8");
    // Match a literal "SAP Best Practices 25xx" or "26xx" string — that's the
    // pattern the drift CI test catches. After Phase 11 there should be ZERO
    // hardcoded version strings.
    const hardcoded = src.match(/"SAP Best Practices \d{4}"/g);
    expect(hardcoded, "ui-text.ts should not contain any hardcoded SAP version literals").toBeNull();
  });
});

describe("Phase 11 — status group facade", () => {
  it("exposes exactly 6 user-visible groups", () => {
    expect(STATUS_GROUP_ORDER).toEqual(["setup", "review", "validating", "signoff", "signed", "closed"]);
  });

  it("every internal status maps to a group", () => {
    const internalStatuses = Object.keys(STATUS_LABELS);
    for (const s of internalStatuses) {
      expect(STATUS_GROUPS[s as keyof typeof STATUS_GROUPS], `status "${s}" missing group mapping`).toBeDefined();
    }
  });

  it("groups collapse correctly: 12 internal → 6 user-visible", () => {
    expect(STATUS_GROUPS.draft.key).toBe("setup");
    expect(STATUS_GROUPS.scoping.key).toBe("setup");
    expect(STATUS_GROUPS.in_progress.key).toBe("review");
    expect(STATUS_GROUPS.workshop_active.key).toBe("review");
    expect(STATUS_GROUPS.review_cycle.key).toBe("review");
    expect(STATUS_GROUPS.gap_resolution.key).toBe("review");
    expect(STATUS_GROUPS.pending_validation.key).toBe("validating");
    expect(STATUS_GROUPS.validated.key).toBe("validating");
    expect(STATUS_GROUPS.pending_sign_off.key).toBe("signoff");
    expect(STATUS_GROUPS.signed_off.key).toBe("signed");
    expect(STATUS_GROUPS.handed_off.key).toBe("closed");
    expect(STATUS_GROUPS.archived.key).toBe("closed");
  });

  it("STATUS_GROUP_LABELS covers every group key", () => {
    for (const k of STATUS_GROUP_ORDER) {
      expect(STATUS_GROUP_LABELS[k]).toBeTruthy();
    }
  });
});

describe("Phase 11 — granularity vocabulary", () => {
  it("client uses Summary/Detailed/Per-step labels (DB enum unchanged)", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "src", "components", "scope", "GranularityManagerClient.tsx"),
      "utf8",
    );
    expect(src).toMatch(/label:\s*"Summary"/);
    expect(src).toMatch(/label:\s*"Detailed"/);
    expect(src).toMatch(/label:\s*"Per-step"/);
    // Verify the old labels are gone (would catch a partial revert)
    expect(src.match(/label:\s*"Coarse"/), "Coarse label should be replaced").toBeNull();
    expect(src.match(/label:\s*"Medium"/), "Medium label should be replaced").toBeNull();
    expect(src.match(/label:\s*"Fine"/), "Fine label should be replaced").toBeNull();
  });
});
