/**
 * The copy deck is transcribed faithfully, and the blocked copy stays blocked
 * (PR-2).
 *
 * WHY THIS EXISTS. The audit found 57 user-facing message strings written inline
 * across components — several saying the same thing in different words, a few
 * contradicting each other. Copy next to markup gets edited by whoever is
 * touching the markup. The point of `copy.ts` is that changing what the product
 * claims should be a deliberate act, and these assertions are what make an
 * accidental edit fail rather than ship.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  ACTION_TOASTS,
  CONFIRMATIONS,
  COPY_BLOCKED_ON_BACKEND,
  DISABLED_REASONS,
  EMPTY_STATES,
  LANE_DETAIL,
  WHY_CASE_HOP,
  deactivateSapSystemConfirm,
  operationsAllHealthy,
  whyExplanation,
  type WhyCase,
} from "@/lib/coreedge/copy";
import { LANE_HOPS, LANE_STATUSES, STATUS_OWNERS } from "@/lib/coreedge/status-vocabulary";

const ROOT = process.cwd();
const DECK = path.resolve(ROOT, "docs/coreedge/design/A6-CoreEdge-Copy-Deck.md");

/**
 * The deck is committed, so the test reads the source rather than a copy of it.
 * Every literal asserted below is checked to appear in the deck too — which is
 * what makes this a transcription test rather than a restatement of whatever the
 * module happens to say.
 */
const deck = readFileSync(DECK, "utf8");

function inDeck(phrase: string): boolean {
  return deck.includes(phrase);
}

/**
 * PR-6 widened the sources, and this is where that is recorded.
 *
 * PR-2's copy came from A6 alone. The seven screens PR-6 added take their words
 * from the scenario canvases as well — A6 never covered /operations/keys or the
 * per-service matrix — so the corpus below is A6 PLUS every committed canvas,
 * with tags stripped. The guard is unchanged in spirit: a string must have been
 * written by the design, not by whoever was editing the markup.
 */
const CANVAS_DIR = path.resolve(ROOT, "docs/coreedge/design");
const designCorpus = (() => {
  const canvases = readdirSync(CANVAS_DIR).filter((f) => f.endsWith(".dc.html"));
  const text = canvases
    .map((f) => readFileSync(path.resolve(CANVAS_DIR, f), "utf8"))
    .map((html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " "))
    .join("\n");
  return normalise(`${deck}\n${text}`);
})();

/** Curly quotes, dashes and wrapped whitespace differ between sources, not in meaning. */
function normalise(text: string): string {
  return text
    .replace(/\u2019/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function inDesign(phrase: string): boolean {
  return designCorpus.includes(normalise(phrase));
}

/**
 * Every sentence of a string must come from the design, even when the whole
 * string does not appear contiguously.
 *
 * The canvases interleave product copy with scenario cross-references — O08
 * writes "Revoking is for a platform admin or a reviewer, on A05 — and it is
 * irreversible." The "on A05" is a note to a reader of the canvas, not words
 * the product says, so a string that drops it is still a faithful transcription
 * while failing a contiguous match. Checking sentence by sentence keeps the
 * guard's teeth (no invented sentence passes) without demanding that we ship
 * the design's own footnotes.
 */
function everySentenceInDesign(phrase: string): boolean {
  return phrase
    .split(/(?<=[.?!])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12)
    .every((part) => inDesign(part.replace(/[.?!]+$/, "")));
}

/**
 * Copy the designs never wrote, because the designs did not know about it.
 *
 * Each entry describes a LIMIT OF THIS IMPLEMENTATION rather than a product
 * decision: a control with no backend behind it, a column with no store, an
 * empty state for a screen A6 predates. They are listed one by one, so adding
 * invented product voice still means editing this list and saying why — which
 * is the whole point of the guard.
 *
 * Anything here that later gains a design source should move out of this list.
 */
const IMPLEMENTATION_GAP_COPY: ReadonlySet<string> = new Set([
  // No model records which fields a grant covers — see PassportRow.fieldsApproved.
  "noFieldSelectionStore",
  // The console has no write path for these yet; the controls render disabled.
  "noWritePathYet",
  // An SDK needs a captured contract; a lane that never returned 200 has none.
  "noContractYet",
  // Empty states for screens that postdate A6.
  "catalogueNone",
  "keysNone",
  "keysAllInUse",
  "passportNone",
  "servicesNoneProbed",
  "appNoFeeds",
]);

describe("every string traces back to A6", () => {
  it("finds the deck, so a bad path cannot pass vacuously", () => {
    expect(deck.length).toBeGreaterThan(1000);
    expect(deck).toContain("CoreEdge copy deck");
  });

  it("takes every button label from the deck verbatim", () => {
    for (const [key, action] of Object.entries(ACTIONS)) {
      expect(inDeck(action.button), `${key}: "${action.button}" is not in A6`).toBe(true);
    }
  });

  it("takes every constant toast from the deck verbatim", () => {
    for (const [key, action] of Object.entries(ACTIONS)) {
      if (action.success === null) continue;
      expect(inDeck(action.success), `${key}: "${action.success}" is not in A6`).toBe(true);
    }
  });

  it("takes every disabled reason from the design, or declares it a gap", () => {
    for (const [key, reason] of Object.entries(DISABLED_REASONS)) {
      if (IMPLEMENTATION_GAP_COPY.has(key)) continue;
      expect(
        everySentenceInDesign(reason),
        `${key} has a sentence in no design source: "${reason}"`,
      ).toBe(true);
    }
  });

  it("takes every empty state from the design, or declares it a gap", () => {
    for (const [key, empty] of Object.entries(EMPTY_STATES)) {
      if (IMPLEMENTATION_GAP_COPY.has(key)) continue;
      expect(
        everySentenceInDesign(empty.message),
        `${key} has a sentence in no design source: "${empty.message}"`,
      ).toBe(true);
    }
  });

  it("takes every confirmation title from the design", () => {
    for (const [key, c] of Object.entries(CONFIRMATIONS)) {
      expect(inDesign(c.title), `${key} title is in no design source: "${c.title}"`).toBe(true);
    }
  });

  it("takes every Why? headline and body from the deck", () => {
    const cases = Object.keys(WHY_CASE_HOP) as WhyCase[];
    for (const c of cases) {
      // Rendered with the deck's own placeholder values so the interpolated
      // sentence is the sentence the deck wrote.
      const e = whyExplanation(c, {
        env: "{env}",
        date: "{date}",
        dataset: "{dataset}",
        system: "{system}",
        seconds: NaN,
      });
      expect(inDeck(e.headline), `${c}: headline "${e.headline}" is not in A6`).toBe(true);
      // The rate-limit body interpolates {n}, which the deck spells differently
      // from our numeric argument; assert its stable half.
      const bodyToCheck = c === "rateLimit" ? "60 calls per minute per key." : e.body;
      expect(inDeck(bodyToCheck), `${c}: body is not in A6`).toBe(true);
    }
  });
});

describe("the Why? trace keeps the distinctions A6 drew", () => {
  it("does not collapse the two Access cases, which differ in owner and action", () => {
    const fresh = whyExplanation("access", { env: "Test" });
    const expired = whyExplanation("accessExpired", { date: "9 Mar 2027" });
    expect(fresh.action).toBe("Request access");
    expect(expired.action).toBe("Renew access");
    expect(fresh.owner).not.toBe(expired.owner);
  });

  it("does not collapse the two Binding cases", () => {
    const none = whyExplanation("binding", { env: "Prod" });
    const ambiguous = whyExplanation("bindingAmbiguous", { env: "Prod" });
    expect(none.action).toBe("Ask platform admin");
    expect(ambiguous.action).toBe("Open SAP systems");
  });

  it("keeps 401 and 403 on different hops with different owners", () => {
    const unauthorised = whyExplanation("sapMetadata401");
    const refused = whyExplanation("sapDataRead403", { dataset: "Purchase orders" });
    expect(unauthorised.owner).toBe("platformAdmin");
    expect(refused.owner).toBe("clientSapAdmin");
    expect(WHY_CASE_HOP.sapMetadata401).not.toBe(WHY_CASE_HOP.sapDataRead403);
  });

  it("names a real owner and a real hop for every case", () => {
    for (const c of Object.keys(WHY_CASE_HOP) as WhyCase[]) {
      expect(STATUS_OWNERS).toContain(whyExplanation(c).owner);
      expect(LANE_HOPS).toContain(WHY_CASE_HOP[c]);
    }
  });

  it("still produces a sentence that parses when a placeholder is missing", () => {
    /*
     * A6 interpolates {env}, {date}, {dataset}, {system} and {n}. A trace is
     * shown at the moment something broke, which is exactly when a value is most
     * likely to be absent — so the failure mode has to be a vaguer true
     * sentence, never the word "undefined" on the screen.
     */
    for (const c of Object.keys(WHY_CASE_HOP) as WhyCase[]) {
      const e = whyExplanation(c);
      expect(e.headline).not.toContain("undefined");
      expect(e.body).not.toContain("undefined");
      expect(e.headline).not.toContain("{");
      expect(e.body).not.toContain("{");
      expect(e.headline.length).toBeGreaterThan(10);
    }
  });
});

describe("lines under the lane chip", () => {
  it("has a line function for all eighteen statuses", () => {
    for (const s of LANE_STATUSES) {
      expect(typeof LANE_DETAIL[s], `${s} has no detail line`).toBe("function");
    }
  });

  it("never renders 'undefined' or a raw placeholder when facts are missing", () => {
    for (const s of LANE_STATUSES) {
      const line = LANE_DETAIL[s]({});
      if (line === null) continue;
      expect(line, `${s}`).not.toContain("undefined");
      expect(line, `${s}`).not.toContain("NaN");
      expect(line, `${s}`).not.toContain("{");
    }
  });

  it("distinguishes 'no line' from 'an empty line'", () => {
    // notStarted is the one A6 marks "—": the chip stands alone.
    expect(LANE_DETAIL.notStarted({})).toBeNull();
    for (const s of LANE_STATUSES) {
      expect(LANE_DETAIL[s]({}), `${s} returned an empty string instead of null`).not.toBe("");
    }
  });

  it("says a No data lane is not an error, in those words", () => {
    // The single most important line in the deck: a successful empty read is
    // routinely read as a failure, and gate-info exists to say otherwise.
    expect(LANE_DETAIL.noData({ checkedAgo: "4 m ago" })).toContain("not an error");
  });

  it("counts rows in the singular correctly", () => {
    expect(LANE_DETAIL.live({ rows: 1, checkedAgo: "2 m ago" })).toBe("1 row · checked 2 m ago");
    expect(LANE_DETAIL.live({ rows: 5, checkedAgo: "2 m ago" })).toBe("5 rows · checked 2 m ago");
  });
});

describe("counted sentences count correctly", () => {
  it("agrees with itself about how many lanes there are", () => {
    expect(operationsAllHealthy(11, 15)).toBe(
      "All 11 lanes are live and checked within the last 15 minutes.",
    );
    expect(operationsAllHealthy(1, 15)).toContain("All 1 lane is live");
  });

  it("lists the lanes a deactivation would stop, rather than only counting them", () => {
    const c = deactivateSapSystemConfirm(["Purchase orders · Test", "Invoices · Test"]);
    expect(c.body).toContain("2 lanes use this system");
    expect(c.body).toContain("Purchase orders · Test");
    expect(c.body).toContain("Invoices · Test");
  });

  it("does not claim lanes will stop when none will", () => {
    expect(deactivateSapSystemConfirm([]).body).toBe("No lanes use this system right now.");
  });

  it("pluralises a single notified reviewer correctly", () => {
    expect(ACTION_TOASTS.promoted("Nadia", 2)).toBe("Review requested · Nadia and 2 others notified");
    expect(ACTION_TOASTS.promoted("Nadia", 1)).toBe("Review requested · Nadia and 1 other notified");
    expect(ACTION_TOASTS.promoted("Nadia", 0)).toBe("Review requested · Nadia notified");
  });
});

describe("destructive actions are marked and confirmed", () => {
  it("marks exactly the two red actions A6 marks red", () => {
    const destructive = Object.entries(ACTIONS)
      .filter(([, a]) => "destructive" in a && a.destructive === true)
      .map(([k]) => k);
    expect(destructive.sort()).toEqual(["replaceKey", "revokeKey"]);
  });

  it("requires a reason only where A6 requires one", () => {
    expect(CONFIRMATIONS.revokeKey.reasonRequired).toBe(true);
    expect(CONFIRMATIONS.replaceKey.reasonRequired).toBe(false);
  });

  it("says revoking cannot be undone, in those words", () => {
    expect(CONFIRMATIONS.revokeKey.body).toContain("can't be undone");
  });
});

describe("copy that must not ship yet", () => {
  /*
   * The build brief: items 4 and 9 of the backend list "are referenced in
   * shipped copy: until they exist, that copy must not ship." The claim link's
   * shown-once guarantee and the CLI's `coreedge pull` are both offered as real
   * paths in A6. Writing either string before the capability exists puts a
   * promise on the screen that nothing keeps.
   */
  it("names the blocked phrases rather than writing them", () => {
    expect(COPY_BLOCKED_ON_BACKEND.length).toBeGreaterThan(0);
  });

  it("does not use any blocked phrase anywhere in src/", async () => {
    const { execFileSync } = await import("node:child_process");
    for (const phrase of COPY_BLOCKED_ON_BACKEND) {
      let hits = "";
      try {
        hits = execFileSync(
          "grep",
          ["-rIl", "--exclude-dir=node_modules", "-F", phrase, path.resolve(ROOT, "src")],
          { encoding: "utf8" },
        );
      } catch {
        hits = ""; // grep exits 1 when nothing matches, which is the pass case
      }
      // copy.ts itself names them in COPY_BLOCKED_ON_BACKEND; that is the list,
      // not a use.
      const files = hits
        .split("\n")
        .filter(Boolean)
        .filter((f) => !f.endsWith("src/lib/coreedge/copy.ts"));
      expect(
        files,
        `"${phrase}" describes a capability the backend does not have yet (PR-5). ` +
          `Remove it, or land the capability first:\n${files.join("\n")}`,
      ).toEqual([]);
    }
  });
});
