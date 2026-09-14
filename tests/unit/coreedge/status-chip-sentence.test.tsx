/**
 * What a screen reader actually hears from a StatusChip.
 *
 * THE SENTENCE WAS ASSEMBLED BY INTERPOLATION and it read badly in two
 * separate ways, both of them invisible to a sighted reviewer because the
 * visible chip is a label and a phrase side by side, not a sentence.
 *
 *   1. Every `means` in the vocabulary ends with a full stop, and the evidence
 *      clause was appended straight after it: "No approved access for this feed
 *      in this environment., checked 4 m ago."
 *   2. The clause always began with the word "checked". Once a lane could say
 *      WHY it had no age, that became "…, checked not checked · no dataset
 *      chosen." — a sentence claiming a check that explicitly did not happen.
 *
 * These render the component rather than reading its source, because the bug
 * was in the assembled string and nothing short of assembling it can see that.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusChip } from "@/components/coreedge/StatusChip";
import {
  laneAge,
  UNCHECKED_AGE,
  UNCHECKED_ANNOUNCED,
} from "@/lib/coreedge/copy";
import {
  notStartedVerdict,
  UNCHECKED_REASONS,
  type LaneVerdict,
} from "@/lib/coreedge/lanes";
import { LANE_HOPS, LANE_STATUSES, LANE_STATUS_VOCABULARY } from "@/lib/coreedge/status-vocabulary";

const NOW = new Date("2026-09-14T12:00:00Z");

/** The announced text — the only thing these tests care about. */
function announced(ui: Parameters<typeof render>[0]): string {
  const { container, unmount } = render(ui);
  const node = container.querySelector(".sr-only");
  const text = (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  unmount();
  return text;
}

describe("the announced sentence is a sentence", () => {
  it("does not double the full stop where the meaning already has one", () => {
    const text = announced(<StatusChip status="noAccess" age="4 m ago" />);
    expect(text).toBe(
      "No access. No approved access for this feed in this environment, checked 4 m ago.",
    );
    expect(text).not.toContain(".,");
  });

  it("never doubles it for any status, with an age or without", () => {
    for (const status of LANE_STATUSES) {
      expect(announced(<StatusChip status={status} age="4 m ago" />), status).not.toContain(".,");
      expect(announced(<StatusChip status={status} />), status).not.toContain(".,");
      // And it still ends as a sentence rather than trailing off.
      expect(announced(<StatusChip status={status} />).endsWith("."), status).toBe(true);
    }
  });

  it("still ends with the meaning when no evidence is passed", () => {
    // A chip with no age is a claim with no evidence, and must look like one
    // rather than borrowing a clause it does not have.
    const text = announced(<StatusChip status="live" />);
    expect(text).toBe(`Live. ${LANE_STATUS_VOCABULARY.live.means}`);
    expect(text).not.toContain("checked ");
  });
});

describe("a lane with no check does not claim one", () => {
  it("drops the word 'checked' when the age slot holds a reason instead", () => {
    // The exact regression: a null checkedAt used to be announced as
    // "…, checked never checked." and then "…, checked not checked · …".
    const text = announced(<StatusChip status="notStarted" {...laneAge(notStartedVerdict(), NOW)} />);
    expect(text).toBe(
      `Not started. Nothing requested for this environment yet, ${UNCHECKED_ANNOUNCED.nothingRequested}.`,
    );
    expect(text).not.toContain("checked nothing requested");
    // The chip's own phrase must not be what is read aloud — see below.
    expect(text).not.toContain(UNCHECKED_AGE.nothingRequested);
  });

  it("does the same for every reason a lane can give", () => {
    for (const [reason, phrase] of Object.entries(UNCHECKED_AGE)) {
      const text = announced(<StatusChip status="unknown" age={phrase} />);
      expect(text, reason).toContain(`, ${phrase}.`);
      expect(text, reason).not.toContain(`checked ${phrase}`);
    }
  });

  it("keeps 'checked' for a real age", () => {
    // The other half of the same rule: a measurement must still be introduced
    // as one, or the sentence stops saying what the age is the age OF.
    const proven: LaneVerdict = {
      status: "live",
      brokenHop: null,
      because: "Every hop proved, most recently at the time shown.",
      checkedAt: new Date(NOW.getTime() - 4 * 60_000),
      unchecked: null,
      hops: LANE_HOPS.map((hop) => ({ hop, state: "ok" as const })),
    };
    expect(announced(<StatusChip status="live" {...laneAge(proven, NOW)} />)).toContain(
      "checked 4 m ago.",
    );
  });

  it("announces the evidence at all, however it is phrased", () => {
    // The age is the product's central claim; a claim only sighted users can
    // hear is not a claim the product makes.
    render(<StatusChip status="noSapSystem" age="not checked · no system connected here" />);
    expect(screen.getByText(/no system connected here\.$/)).toBeTruthy();
  });
});

/**
 * The chip's phrase and the announced clause are different strings.
 *
 * THE DEFECT THIS PINS reached production. `UNCHECKED_AGE` is built for the slot
 * beside a label, and splicing it into the spoken sentence produced:
 *
 *   "No key. Access approved, no key collected — or it was revoked,
 *    not checked · the app is not live."
 *
 * Grammatical, and not a sentence: a chip's middot read aloud as punctuation,
 * and the whole thing landing as a list. The eye and the ear want different
 * strings, so `laneAge` returns both and these assert the ear's.
 */
describe("what is read aloud ends the sentence", () => {
  it("uses the announced clause, never the chip phrase", () => {
    for (const reason of UNCHECKED_REASONS) {
      const verdict: LaneVerdict = {
        status: "noKey",
        brokenHop: "key",
        because: "Access is approved but no key has been collected for this environment.",
        checkedAt: null,
        unchecked: reason,
        hops: LANE_HOPS.map((hop) => ({ hop, state: "ok" as const })),
      };
      const text = announced(<StatusChip status="noKey" {...laneAge(verdict, NOW)} />);

      expect(text, reason).toBe(
        `No key. ${LANE_STATUS_VOCABULARY.noKey.means.replace(/\.$/, "")}, ${UNCHECKED_ANNOUNCED[reason]}.`,
      );
      // The chip keeps its own phrase; the ear must not hear it.
      expect(text, reason).not.toContain(UNCHECKED_AGE[reason]);
      expect(laneAge(verdict, NOW).age, reason).toBe(UNCHECKED_AGE[reason]);
    }
  });

  it("never reads a glyph separator aloud", () => {
    // "·" is chip furniture. Hearing it is how the sentence became a list.
    for (const reason of UNCHECKED_REASONS) {
      expect(UNCHECKED_ANNOUNCED[reason], reason).not.toContain("·");
      expect(UNCHECKED_ANNOUNCED[reason], reason).not.toMatch(/[.,;]$/);
      expect(UNCHECKED_ANNOUNCED[reason].length, reason).toBeGreaterThan(20);
    }
    // And the six stay six distinct clauses.
    expect(new Set(Object.values(UNCHECKED_ANNOUNCED)).size).toBe(UNCHECKED_REASONS.length);
  });

  it("still says 'checked' for a lane that was", () => {
    const proven: LaneVerdict = {
      status: "live",
      brokenHop: null,
      because: "Every hop proved, most recently at the time shown.",
      checkedAt: new Date(NOW.getTime() - 4 * 60_000),
      unchecked: null,
      hops: LANE_HOPS.map((hop) => ({ hop, state: "ok" as const })),
    };
    expect(laneAge(proven, NOW)).toEqual({ age: "4 m ago", announced: "checked 4 m ago" });
  });
});
