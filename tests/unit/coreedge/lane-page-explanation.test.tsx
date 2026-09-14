/**
 * The lane page says one thing, once, and it matches the chip.
 *
 * THE DEFECT THIS PINS reached production. /coreedge/apps/…/TEST rendered three
 * lines where one belonged:
 *
 *   "Access is approved but no key has been collected for this environment."
 *   "This key isn't valid."
 *   "Access is approved but no key has been collected for this environment."
 *
 * The middle line was WhyTrace's heading, still `whyExplanation(case).headline`
 * — a generic key-failure sentence contradicting the chip beside it and the
 * paragraph beneath it. The outer two were the lane's real explanation, printed
 * once by the page and again by the trace.
 *
 * THIS RENDERS THE PAGE, not a component, because the duplication only existed
 * once the page and the trace were composed. The page is a server component that
 * is a plain async function, so it can be awaited and rendered to markup with
 * its data and chrome mocked out.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LANE_HOPS, LANE_STATUSES, type LaneStatus } from "@/lib/coreedge/status-vocabulary";
import { whyExplanation, WHY_CASE_HOP, type WhyCase } from "@/lib/coreedge/copy";
import type { LaneVerdict } from "@/lib/coreedge/lanes";

const listLanes = vi.fn();
const lastLaneCall = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u1", organizationId: "org1" }),
}));
vi.mock("@/lib/coreedge/queries", () => ({
  listLanes: (...a: unknown[]) => listLanes(...a),
  lastLaneCall: (...a: unknown[]) => lastLaneCall(...a),
}));
// The chrome is not what is under test, and the rail is a client component.
vi.mock("@/app/(coreedge)/coreedge/CoreEdgeShell", () => ({
  CoreEdgeShell: ({ children }: { children: unknown }) => children,
}));

/** The explanation every status carries, made distinguishable per status. */
const becauseFor = (status: LaneStatus) => `THE LANE SENTENCE FOR ${status}.`;

function laneFor(status: LaneStatus) {
  const verdict: LaneVerdict = {
    status,
    brokenHop: null,
    because: becauseFor(status),
    checkedAt: null,
    unchecked: "notRunYet",
    hops: LANE_HOPS.map((hop) => ({ hop, state: "ok" as const })),
  };
  return {
    appId: "a1",
    appSlug: "qa-delivery-tracker",
    appName: "QA delivery tracker",
    appStatus: "active" as const,
    feedId: "f1",
    feedName: "Purchase orders",
    environment: "TEST" as const,
    system: "S4H-TST-01",
    verdict,
    rows: null,
  };
}

async function renderLane(status: LaneStatus): Promise<string> {
  listLanes.mockResolvedValue([laneFor(status)]);
  lastLaneCall.mockResolvedValue(null);
  const { default: LaneDetail } = await import(
    "@/app/(coreedge)/coreedge/apps/[app]/[feed]/[env]/page"
  );
  const tree = await LaneDetail({
    params: Promise.resolve({ app: "qa-delivery-tracker", feed: "f1", env: "TEST" }),
  });
  return renderToStaticMarkup(tree as never);
}

/** Count non-overlapping occurrences of a literal in the rendered markup. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  listLanes.mockReset();
  lastLaneCall.mockReset();
});

describe("every status renders exactly one explanation", () => {
  it("prints the lane's own sentence once, for all eighteen", async () => {
    for (const status of LANE_STATUSES) {
      const html = await renderLane(status);
      expect(occurrences(html, becauseFor(status)), `${status} explanation count`).toBe(1);
    }
  });

  it("never introduces it with a different case's headline", async () => {
    /*
     * The exact production line. `noKey` and `keyNotValid` both map to A6's one
     * "Key" case, whose headline is "This key isn't valid." — true of one of
     * them at most, and contradicting the chip on a lane that simply has no key
     * collected yet.
     */
    for (const status of LANE_STATUSES) {
      const html = await renderLane(status);
      for (const whyCase of Object.keys(WHY_CASE_HOP) as WhyCase[]) {
        const { headline, body } = whyExplanation(whyCase);
        expect(html, `${status} shows ${whyCase} headline`).not.toContain(headline);
        expect(html, `${status} shows ${whyCase} body`).not.toContain(body);
      }
    }
  });

  it("draws a strip that agrees with the chip", async () => {
    /*
     * ITEM 11, EXTENDED TO THE LANE PAGE. The page rendered
     * "Key — failed here → Access — not reached" beside a chip meaning access is
     * approved. Here the verdict says access proved and the key broke, and the
     * markup must say exactly that.
     */
    listLanes.mockResolvedValue([
      {
        ...laneFor("noKey"),
        verdict: {
          ...laneFor("noKey").verdict,
          brokenHop: "key" as const,
          hops: [
            { hop: "key" as const, state: "broken" as const },
            { hop: "access" as const, state: "ok" as const },
            { hop: "binding" as const, state: "unreached" as const },
            { hop: "sapMetadata" as const, state: "unreached" as const },
            { hop: "sapDataRead" as const, state: "unreached" as const },
            { hop: "app" as const, state: "unreached" as const },
          ],
        },
      },
    ]);
    lastLaneCall.mockResolvedValue(null);
    const { default: LaneDetail } = await import(
      "@/app/(coreedge)/coreedge/apps/[app]/[feed]/[env]/page"
    );
    const html = renderToStaticMarkup(
      (await LaneDetail({
        params: Promise.resolve({ app: "qa-delivery-tracker", feed: "f1", env: "TEST" }),
      })) as never,
    );

    expect(html).toContain("Key</span><span class=\"sr-only\">— failed here");
    expect(html).toContain("Access</span><span class=\"sr-only\">— passed");
    expect(html).not.toContain("Access</span><span class=\"sr-only\">— not reached");
    // One strip on the page, not two drawn from two sources.
    expect(occurrences(html, "<ol class=")).toBe(1);
  });

  it("shows the chip for that status beside it", async () => {
    // One explanation, and it is the one for the status the chip announces.
    const html = await renderLane("noKey");
    expect(html).toContain("No key");
    expect(html).toContain(becauseFor("noKey"));
    expect(html).not.toContain("This key isn't valid.");
  });
});
