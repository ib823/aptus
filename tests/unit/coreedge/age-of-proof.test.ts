import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { proofAge } from "@/lib/coreedge/freshness";

const ROOT = path.resolve(__dirname, "../../..");
const code = (rel: string) =>
  readFileSync(path.resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/**
 * The age of proof is the product's central claim, and it was invisible.
 * These assert it is rendered, announced, and never printed as a raw instant.
 */

describe("proofAge is always a phrase", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("describes a real instant in the deck's own compact form", () => {
    // "4 m ago" — the form A6 and the canvases use, not a spelled-out one.
    expect(proofAge(new Date(now.getTime() - 4 * 60_000), now)).toBe("4 m ago");
  });

  it("says so when nothing has ever been checked", () => {
    // An omitted age is indistinguishable from a fresh one at a glance, which
    // is the overclaim the whole model exists to prevent.
    expect(proofAge(null, now)).toBe("never checked");
  });
});

/**
 * These assert `laneCheckedAge`, not `proofAge`, since PR-7b.
 *
 * `proofAge` renders an instant and has one answer for every lane without one:
 * "never checked". That phrase was covering six different situations — nobody
 * requested this lane, the app is not live, the feed names no dataset, no
 * system is connected, the secret would not open, the nightly run has not
 * reached it — and an operator could not tell which. `laneCheckedAge` takes the
 * whole verdict, so it still calls `proofAge` where there IS an age and names
 * the reason where there is not. The guard below keeps any screen from going
 * back to the bare call and collapsing the six again.
 */
describe("every status renders with its age", () => {
  it("Home passes the age to its lane chips", () => {
    const body = code("src/app/(coreedge)/coreedge/page.tsx");
    expect(body).toContain("laneAge(lane.verdict");
  });

  it("the app board passes facts to LaneCard, which it did not", () => {
    const body = code("src/app/(coreedge)/coreedge/apps/[app]/page.tsx");
    expect(body).toContain("checkedAgo: laneAge(");
  });

  it("the lane detail passes the age to the chip and the strip", () => {
    const body = code("src/app/(coreedge)/coreedge/apps/[app]/[feed]/[env]/page.tsx");
    // Spread, because the chip now takes the visible phrase AND the clause
    // that is read aloud, and a caller must not be able to pass one alone.
    expect(body).toContain("{...laneAge(lane.verdict, now)}");
    expect(body).toContain("checkedAge: laneAge(");
  });

  it("the operations board shows it as a column and in the chip", () => {
    const body = code("src/app/(coreedge)/coreedge/operations/page.tsx");
    expect(body).toContain('header: "Checked"');
    expect(body).toContain("{...laneAge(l.verdict, now)}");
  });

  it("no screen renders a verdict's age with the bare helper", () => {
    // The regression this file now exists to prevent. `proofAge` is still the
    // right call for any OTHER instant on these pages — the sweep's last run
    // time, for one — so the guard is narrow: never on a lane verdict.
    for (const rel of [
      "src/app/(coreedge)/coreedge/page.tsx",
      "src/app/(coreedge)/coreedge/operations/page.tsx",
      "src/app/(coreedge)/coreedge/apps/[app]/page.tsx",
      "src/app/(coreedge)/coreedge/apps/[app]/[feed]/[env]/page.tsx",
    ]) {
      expect(code(rel), rel).not.toMatch(/proofAge\(\s*\w+\.verdict\.checkedAt/);
      // And never the chip phrase where the announced clause belongs.
      expect(code(rel), rel).not.toMatch(/age=\{laneCheckedAge\(/);
    }
  });

  it("the requests screens show waiting time, which is their age", () => {
    expect(code("src/app/(coreedge)/coreedge/requests/page.tsx")).toContain('header: "Waiting"');
    expect(code("src/app/(coreedge)/coreedge/requests/[id]/page.tsx")).toContain("waiting ${");
  });
});

describe("the age is announced, not only shown", () => {
  it("StatusChip puts it in the screen-reader text", () => {
    const body = code("src/components/coreedge/StatusChip.tsx");
    const srOnly = body.slice(body.indexOf('className="sr-only"'));
    const announced = srOnly.slice(0, srOnly.indexOf("</span>"));
    expect(announced).toContain("age");
  });

  it("and still shows it visually", () => {
    expect(code("src/components/coreedge/StatusChip.tsx")).toContain('aria-hidden="true"');
  });
});

describe("a stored instant never reaches the screen raw", () => {
  it("the lane detail no longer renders toISOString as the visible fact", () => {
    const body = code("src/app/(coreedge)/coreedge/apps/[app]/[feed]/[env]/page.tsx");
    // The ISO string is still PASSED — ProvenAt needs it — but it must travel
    // with an age, so the reader is never shown the stored instant alone.
    expect(body).toContain("checkedAt.toISOString()");
    expect(body).toContain("checkedAge:");
  });

  it("ProvenAt names the zone it is rendering in", () => {
    const body = code("src/components/coreedge/primitives/ProvenAt.tsx");
    expect(body).toContain("timeZoneName");
    // Server-side it must be UTC, named — rendering the server's zone and
    // calling it the reader's would look correct and be wrong.
    expect(body).toContain('"UTC"');
    expect(body).toContain("resolvedOptions().timeZone");
  });
});

describe("the operations board sorts by age of proof after urgency", () => {
  it("compares checkedAt, and a never-checked lane sorts first", () => {
    const body = code("src/app/(coreedge)/coreedge/operations/page.tsx");
    expect(body).toContain("checkedAt?.getTime() ?? Number.NEGATIVE_INFINITY");
  });

  it("counts calls and errors from the audit table, not from the status", () => {
    const body = code("src/app/(coreedge)/coreedge/operations/page.tsx");
    expect(body).toContain('header: "Calls 24 h"');
    expect(body).toContain('header: "Errors"');
    expect(body).toContain("listLaneTraffic");
  });
});
