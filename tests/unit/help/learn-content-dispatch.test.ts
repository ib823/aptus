/**
 * The learn framework serves the domain the reader is actually looking at.
 *
 * One provider, two glossaries. The dispatch is a single path test, and it had
 * drifted behind the product: it matched `/sap-explorer` only, while Studio's
 * Discover screen renders the same SAP catalogue components — which is the
 * stated reason `(studio)/layout.tsx` mounts the provider in the first place.
 *
 * The result was quiet and wrong rather than broken. The drawer opened, it was
 * full, and every term in it was from the wrong domain: a builder reading an
 * OData entity set was offered "Fit-to-Standard", "affirm bundle" and "value
 * stream". Nothing errored, so nothing surfaced it.
 *
 * These pin the mapping in both directions — the SAP surfaces get SAP terms, and
 * the affirm surfaces are not quietly switched over by a matcher that grew too
 * greedy.
 */

import { describe, expect, it } from "vitest";

import { AFFIRM_GLOSSARY } from "@/constants/affirm-glossary";
import { SAP_GLOSSARY } from "@/constants/sap-glossary";
import { glossaryEntry, glossaryFor } from "@/lib/learn/content";

/** A term that exists in one glossary and not the other, so the two are told apart. */
const SAP_ONLY = "odata-v4";
const AFFIRM_ONLY = "fit-to-standard";

describe("the two glossaries are actually distinct", () => {
  it("has a marker term unique to each, or the assertions below prove nothing", () => {
    expect(Object.keys(SAP_GLOSSARY)).toContain(SAP_ONLY);
    expect(Object.keys(AFFIRM_GLOSSARY)).not.toContain(SAP_ONLY);
    expect(Object.keys(AFFIRM_GLOSSARY)).toContain(AFFIRM_ONLY);
    expect(Object.keys(SAP_GLOSSARY)).not.toContain(AFFIRM_ONLY);
  });
});

describe("SAP catalogue surfaces get the SAP glossary", () => {
  it.each([
    "/sap-explorer",
    "/sap-explorer/some-capability",
    // THE REGRESSION. Studio's Discover renders the SAP catalogue and used to
    // resolve to the affirm glossary.
    "/studio/discover",
    "/studio/discover/CE_PRODUCT",
  ])("%s", (pathname) => {
    const { entries } = glossaryFor(pathname);
    expect(Object.keys(entries), `${pathname} should serve SAP terms`).toContain(SAP_ONLY);
    expect(Object.keys(entries)).not.toContain(AFFIRM_ONLY);
  });
});

describe("affirm surfaces keep the affirm glossary", () => {
  it.each([
    "/affirm",
    "/affirm/abc123",
    "/affirm/abc123/questions",
    "/affirm/abc123/review",
  ])("%s", (pathname) => {
    const { entries } = glossaryFor(pathname);
    expect(Object.keys(entries), `${pathname} should serve affirm terms`).toContain(AFFIRM_ONLY);
    expect(Object.keys(entries)).not.toContain(SAP_ONLY);
  });

  it("does not treat a path that merely mentions discover as the SAP catalogue", () => {
    // `/discovery` is the process library — a different product area with no
    // learn content of its own. It must not be captured by the SAP matcher.
    const { entries } = glossaryFor("/discovery");
    expect(Object.keys(entries)).toContain(AFFIRM_ONLY);
  });
});

describe("the ordered list matches the entries it is ordering", () => {
  it.each(["/sap-explorer", "/studio/discover", "/affirm"])("%s", (pathname) => {
    const { entries, order } = glossaryFor(pathname);
    // An id in the order with no entry renders as a gap in the drawer; an entry
    // missing from the order never renders at all.
    const missing = order.filter((id) => !entries[id]);
    expect(missing, `${pathname}: ordered ids with no entry`).toEqual([]);
  });
});

describe("term lookup spans both domains", () => {
  it("resolves a term from either glossary, because <Term> is domain-agnostic", () => {
    // TermChip renders inline wherever it is used and cannot know which domain
    // it is in, so the by-id lookup is deliberately merged. This is the one
    // place the two glossaries are allowed to be one.
    expect(glossaryEntry(SAP_ONLY)).toBeDefined();
    expect(glossaryEntry(AFFIRM_ONLY)).toBeDefined();
  });

  it("returns undefined for an unknown id rather than an empty shell", () => {
    expect(glossaryEntry("not-a-real-term")).toBeUndefined();
  });
});
