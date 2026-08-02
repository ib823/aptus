/**
 * The manual does not deny a capability the product has.
 *
 * `manual-completeness.test.ts` already asserts that every screen has an entry
 * and every entry has a screen. It cannot tell whether an entry is TRUE, and
 * that is where the drift actually landed: grant revocation shipped, and three
 * places went on saying it did not exist —
 *
 *   · the Control Tower manual page: "There is no revocation in this release"
 *   · the Developer Studio access page, explaining expiry as its replacement
 *   · the `unbounded-grant` incident rule, whose remediation told an operator
 *     there was "no in-product way" to end the grant and to treat it as live
 *
 * The last one is the worst of the three. It renders on the Operations incidents
 * screen, so the product instructed an operator to leave standing access in
 * place next to a Revoke button that would have closed it. Meanwhile the Grants
 * screen itself said "Revoke each one" — two surfaces of one product giving
 * opposite instructions about a critical finding.
 *
 * WHAT THIS GUARDS AND WHAT IT CANNOT. It cannot know whether prose is true in
 * general. What it can do is pin the specific claims that a shipped capability
 * makes false, keyed on whether that capability is actually present in the tree.
 * When a capability lands, its denials fail here — by name, with the file to fix.
 * Each entry is a fact someone got wrong once, not a rule invented in advance.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { INCIDENT_REFERENCE, MANUAL } from "@/lib/help/manual";

const repo = (rel: string) => path.resolve(process.cwd(), rel);

/**
 * Every string the manual and the incident reference actually RENDER.
 *
 * Deliberately not the source files: comments legitimately discuss a capability
 * in the past tense ("it was free text, which is how `czxgvz` got in"), and a
 * guard that cannot tell narration from assertion would force those comments to
 * be deleted — losing the reason a thing is the way it is, to protect a claim
 * no user ever reads.
 */
const RENDERED: { where: string; text: string }[] = [
  ...MANUAL.flatMap((m) => [
    { where: `manual ${m.slug} · answers`, text: m.answers },
    ...m.cannotTell.map((c, i) => ({ where: `manual ${m.slug} · cannotTell[${i}]`, text: c })),
    ...m.misreadings.flatMap((r, i) => [
      { where: `manual ${m.slug} · misreadings[${i}].seeing`, text: r.seeing },
      { where: `manual ${m.slug} · misreadings[${i}].means`, text: r.means },
    ]),
  ]),
  ...INCIDENT_REFERENCE.flatMap((r) => [
    { where: `incident ${r.id} · title`, text: r.title },
    { where: `incident ${r.id} · firesWhen`, text: r.firesWhen },
    { where: `incident ${r.id} · whyThisSeverity`, text: r.whyThisSeverity },
    { where: `incident ${r.id} · remediation`, text: r.remediation },
  ]),
];

interface Capability {
  /** What shipped, in the words someone would search for. */
  name: string;
  /** Present in the tree? Cheap and structural — a route file, not behaviour. */
  present: () => boolean;
  /** Phrasings that are false once `present()` holds. */
  denials: RegExp[];
  /** Where to go when this fails. */
  fix: string;
}

const CAPABILITIES: Capability[] = [
  {
    name: "grant revocation (Control Tower)",
    present: () => existsSync(repo("src/app/api/control-tower/grants/[grantId]/revoke/route.ts")),
    denials: [
      /\bno revocation\b/i,
      /\bcannot be revoked\b/i,
      /\brevocation in this release\b/i,
      /\bno in-product way to bound\b/i,
      /\bcan never end\b/i,
      /\bnothing will ever end it\b/i,
      /\bends only by lapsing\b/i,
      /\bexpiry is the only end\b/i,
    ],
    fix: "src/lib/help/manual.ts (PROSE) and src/lib/ops/incidents.ts (INCIDENT_RULES)",
  },
  {
    name: "closed dataClass vocabulary",
    present: () => existsSync(repo("src/lib/studio/data-class.ts")),
    denials: [
      // Only assertions that the FIELD is free text. "free-text response" about
      // a client's answer elsewhere is a different thing and must stay legal.
      /data class[^.]*\bis free text\b/i,
      /\bit is free text recorded at registration\b/i,
    ],
    fix: "src/lib/help/manual.ts — control-tower/portfolio",
  },
];

describe("no rendered help text denies a capability that shipped", () => {
  it.each(CAPABILITIES.map((c) => [c.name, c] as const))("%s", (_name, cap) => {
    // A capability that is not present cannot be denied wrongly — the prose
    // saying it is absent is then simply correct, and this test is not the
    // place to demand it be built.
    if (!cap.present()) return;

    const offenders = RENDERED.flatMap(({ where, text }) =>
      cap.denials
        .filter((d) => d.test(text))
        .map((d) => `${where} matches ${d} — "${text.slice(0, 110)}…"`),
    );

    expect(
      offenders,
      `${cap.name} exists, but help text still says it does not.\n` +
        `Fix in ${cap.fix}:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("the incident reference carries what the manual now renders", () => {
  /*
   * The manual's incident section used to be a three-column table of severity,
   * fires-when and why — dropping `title` and `remediation`, both of which the
   * rules had all along. A reader could not look up an incident by the name the
   * Operations screen gave it, and was never told what to do about it. Now that
   * the page renders both, an empty one would render as a blank row.
   */
  it("every rule has a title an operator can match to the incident they saw", () => {
    for (const r of INCIDENT_REFERENCE) {
      expect(r.title.length, `${r.id} has no title`).toBeGreaterThan(10);
    }
  });

  it("every rule says what to do about it", () => {
    for (const r of INCIDENT_REFERENCE) {
      expect(r.remediation.length, `${r.id} has no remediation`).toBeGreaterThan(20);
    }
  });

  it("no remediation tells the reader that nothing can be done", () => {
    // A remediation field whose content is "there is no remedy" is the shape the
    // unbounded-grant rule had. If a rule genuinely has no fix, that belongs in
    // whyThisSeverity — `remediation` is the field a reader acts on.
    const inert = INCIDENT_REFERENCE.filter((r) =>
      /\bthere is no\b|\bnothing can be done\b|\bno remedy\b/i.test(r.remediation),
    ).map((r) => `${r.id}: ${r.remediation.slice(0, 90)}…`);
    expect(inert, "remediation must be an action").toEqual([]);
  });
});
