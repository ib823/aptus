/**
 * Every route that reads a customer's SAP tenant is gated on a role.
 *
 * THE DEFECT THIS PINS. `/api/sap/tdd/preview` and `/api/sap/tdd/entities` open
 * a live connection to a client's S/4HANA Cloud system and issue a real OData
 * request — measured round trips, logged at the far end, counted against that
 * tenant's limits. Both were gated on "is anyone signed in" and nothing else, so
 * every authenticated role could fire them. Found by calling one endpoint as all
 * six roles and receiving six 200s.
 *
 * THE SHAPE OF THE MISTAKE MATTERS MORE THAN THE TWO ROUTES. The sibling routes
 * under hub-content — probe-all, write-test — were already behind `requireAdmin`
 * on precisely the reasoning that a probe generates real outbound traffic. So
 * the rule existed, was understood, and was applied route by route; two routes
 * were simply missed. A third, `/api/sap/tdd/operations`, was missed as well and
 * was found only by reading the siblings of the two that were reported.
 *
 * A per-route rule that everyone agrees with is exactly the kind that grows a
 * hole, because nothing fails when a new route omits it. This test is what
 * fails.
 *
 * The check is on the CONNECTOR CALL, not on a list of paths: any route that
 * reaches for one of the live-read functions must also reach for the guard. A
 * new route added tomorrow is covered without anyone remembering this file.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const API = join(ROOT, "src/app/api");

/**
 * The connector functions that put a request on the wire to a customer tenant.
 * Reaching for any of these is what makes a route a live read.
 */
const LIVE_READ_CALLS = [
  "previewSapEntitySet",
  "inspectSapService",
  "probeSapEntitySets",
] as const;

/** The guards that are an acceptable answer to holding one of those. */
const ACCEPTED_GUARDS = ["refuseUnlessMayProbeTenant", "requireAdmin"] as const;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("a route that reads a customer tenant is gated on a role", () => {
  const routes = routeFiles(API);

  it("finds route files, so a broken walk cannot pass vacuously", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it("finds the live-read routes it is meant to be checking", () => {
    // If the connector is renamed and this list is not, the scan would find
    // nothing to check and report success forever.
    const live = routes.filter((f) => {
      const src = stripSource(readFileSync(f, "utf8"), "comments");
      return LIVE_READ_CALLS.some((c) => src.includes(c));
    });
    expect(
      live.length,
      "No route appears to call the SAP connector. Either the connector was " +
        "renamed and LIVE_READ_CALLS is stale, or this scan is looking in the " +
        "wrong place — both mean it is asserting nothing.",
    ).toBeGreaterThan(2);
  });

  it("gates every one of them", () => {
    const ungated: string[] = [];

    for (const file of routes) {
      const src = stripSource(readFileSync(file, "utf8"), "comments");
      const call = LIVE_READ_CALLS.find((c) => src.includes(c));
      if (!call) continue;
      if (ACCEPTED_GUARDS.some((g) => src.includes(g))) continue;
      ungated.push(`${relative(ROOT, file)} calls ${call} with no role guard`);
    }

    expect(
      ungated,
      "These routes cause CoreEdge to read a customer's SAP tenant and check " +
        "only that SOMEBODY is signed in. Every authenticated role — executive " +
        "sponsor, project manager, support — can make them fire real outbound " +
        "traffic at a client's production system.\n" +
        "Add `refuseUnlessMayProbeTenant(product.envPrefix)`:\n" +
        ungated.join("\n"),
    ).toEqual([]);
  });
});

describe("the guard says no to the right people", () => {
  // Behaviour, not wiring: the predicate is the decision, so it is pinned here
  // rather than left implicit in three route files.
  it("admits exactly the Developer Studio roles", async () => {
    const { canAccessStudio } = await import("@/lib/studio/rbac");
    const { ALL_USER_ROLES } = await import("@/types/assessment");

    const admitted = ALL_USER_ROLES.filter((r) => canAccessStudio(r));
    expect(admitted.sort()).toEqual(["consultant", "platform_admin"].sort());

    // The four that lost access, named so a future widening is a deliberate edit
    // to this list rather than a silent drift in a predicate.
    for (const refused of ["support", "partner_lead", "project_manager", "executive_sponsor"]) {
      expect(canAccessStudio(refused), `${refused} must not be able to probe a tenant`).toBe(false);
    }
  });
});
