/**
 * The entity set is the feed's, not the caller's (audit E16, P0).
 *
 * THE DEFECT, in three shapes. The grant that authorises a northbound call names
 * a SERVICE; the entity set decides WHICH DATA inside that service leaves the
 * customer's system, and nothing downstream re-checks it. So wherever a caller
 * could supply one, they could read or write a dataset their grant never covered:
 *
 *   - the READ route took `iface.entitySet ?? ?entity=` — a fallback,
 *   - the WRITE route took `parsed.data.entity ?? iface.entitySet` — an OVERRIDE,
 *     and the more dangerous direction, since a second person approved that grant,
 *   - `broker-run` took `input.entity ?? iface.entitySet`, which also made the
 *     console answer a question the deployed application cannot ask.
 *
 * These are source-level assertions on purpose. The property is "this expression
 * does not appear in this file", and the failure mode being guarded is a future
 * edit re-introducing the fallback — which a behavioural test on today's code
 * path would not catch, because it would be testing the value, not the precedence.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

/** Strip comments — the defect is often *described* in a comment above the fix. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}
const flat = (src: string) => code(src).replace(/\s+/g, " ");

const READ_ROUTE = "src/app/api/northbound/interfaces/[id]/data/route.ts";
const WRITE_ROUTE = "src/app/api/northbound/interfaces/[id]/data/write/route.ts";
const BROKER_RUN = "src/app/api/studio/test/broker-run/route.ts";

describe("the read path", () => {
  const src = flat(read(READ_ROUTE));

  it("does not read ?entity= at all", () => {
    // Not "prefers the governed value" — does not consult the parameter. A
    // fallback is still a way for a caller to name a dataset.
    expect(src).not.toContain('searchParams.get("entity")');
  });

  it("takes the entity set from the interface and nothing else", () => {
    expect(src).toContain("const entitySet = iface.entitySet;");
  });

  it("no longer tells callers to pass one", () => {
    // The refusal used to end "…or pass ?entity=". Copy that invites the hole
    // back is part of the hole.
    expect(src).not.toContain("?entity=");
  });

  it("says something different when the feed is a draft", () => {
    // A draft with no dataset is a half-finished definition, not a broken one,
    // and the person who can fix it needs to know which they have.
    expect(src).toContain("iface.draft");
  });
});

describe("the write path", () => {
  const src = flat(read(WRITE_ROUTE));

  it("never lets a caller-supplied entity win", () => {
    expect(src).not.toContain("parsed.data.entity ?? iface.entitySet");
    expect(src).toContain("const entitySet = iface.entitySet;");
  });

  it("refuses a mismatched entity rather than ignoring it", () => {
    // Accepted-and-silently-discarded is the same confusion arrived at from the
    // other side: the client believes it wrote to one dataset, the broker wrote
    // to another.
    expect(src).toContain("parsed.data.entity !== undefined");
    expect(src).toContain("parsed.data.entity !== entitySet");
  });
});

describe("the Test Console's broker dry run", () => {
  const src = flat(read(BROKER_RUN));

  it("never lets a caller-supplied entity win", () => {
    expect(src).not.toContain("input.entity ?? iface.entitySet");
    expect(src).toContain("const entitySet = iface.entitySet;");
  });

  it("refuses a mismatch, because the deployed application could not ask for it", () => {
    expect(src).toContain("ENTITY_NOT_YOURS_TO_CHOOSE");
  });
});

describe("the discovery console keeps its parameter, deliberately", () => {
  // /api/sap/tdd/preview has no interface: choosing an entity set IS the
  // question it exists to answer, which is how a feed's set gets decided in the
  // first place. Removing it would leave the discovery console unable to
  // discover. What changed there is everything around it — an environment
  // ceiling and an audit row (E15).
  const src = flat(read("src/app/api/sap/tdd/preview/route.ts"));

  it("still reads ?entity=", () => {
    expect(src).toContain('searchParams.get("entity")');
  });

  it("but is capped and recorded", () => {
    expect(src).toContain("decideConsoleRead");
    expect(src).toContain("recordConsoleRead");
  });
});
