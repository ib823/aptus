/**
 * The client-confidentiality guard.
 *
 * `ib823/aptus` is a PUBLIC repository, so a client name in a tracked file is
 * a disclosure that git history makes permanent. These tests exist because
 * the guard is the control that has to work when attention does not — a
 * client name reached tracked documentation here once already, and while
 * writing the guard itself a client name went into its own doc comment.
 *
 * No test in this file contains a real client name, for the obvious reason.
 * The fixtures use an invented one.
 */
import { describe, expect, it } from "vitest";

import {
  normalise,
  scanPath,
  scanText,
  termHash,
  type ForbiddenTerm,
} from "../../scripts/lib/confidential-terms";

/** An invented client name — long enough to be realistic, real to nobody. */
const FAKE = "Zarquon Holdings";
const TERMS: ForbiddenTerm[] = [
  {
    hash: termHash(FAKE),
    length: normalise(FAKE).length,
    words: normalise(FAKE).split(" ").length,
    note: "test fixture",
  },
];

describe("normalise", () => {
  it("folds case, punctuation and whitespace so formatting cannot hide a term", () => {
    for (const variant of ["Zarquon Holdings", "ZARQUON  HOLDINGS", "Zarquon-Holdings", "zarquon_holdings"]) {
      expect(normalise(variant)).toBe("zarquon holdings");
    }
  });

  it("treats path separators as word breaks, so a filename cannot hide one either", () => {
    expect(normalise("docs/zarquon-holdings/rfp.md")).toBe("docs zarquon holdings rfp md");
  });
});

describe("scanText", () => {
  it("finds the term and reports the line, but never the term itself", () => {
    const hits = scanText("line one\nprepared for Zarquon Holdings in 2026\nline three", TERMS, "f.md");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(2);
    expect(hits[0]!.note).toBe("test fixture");
    // The hit carries no field that could echo the term into a public CI log.
    expect(JSON.stringify(hits)).not.toContain("Zarquon");
  });

  it("catches it through punctuation and casing", () => {
    for (const text of ["(ZARQUON HOLDINGS)", "the zarquon-holdings bid", "**Zarquon  Holdings**"]) {
      expect(scanText(text, TERMS, "f.md")).toHaveLength(1);
    }
  });

  it("catches it inside a code comment and a JSON string", () => {
    expect(scanText("// built for Zarquon Holdings", TERMS, "a.ts")).toHaveLength(1);
    expect(scanText('{"client":"Zarquon Holdings"}', TERMS, "a.json")).toHaveLength(1);
  });

  it("does not fire on unrelated text that merely shares a word", () => {
    expect(scanText("Zarquon is a fictional planet. Holdings are assets.", TERMS, "f.md")).toEqual([]);
  });

  it("reports one hit per line rather than one per overlapping window", () => {
    expect(scanText("Zarquon Holdings and Zarquon Holdings", TERMS, "f.md")).toHaveLength(1);
  });

  it("is a no-op when the denylist is empty, rather than matching everything", () => {
    expect(scanText("Zarquon Holdings", [], "f.md")).toEqual([]);
  });
});

describe("scanPath", () => {
  it("catches a term in a file path, which needs no opening to leak", () => {
    const hits = scanPath("docs/zarquon-holdings-rfp.md", TERMS);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.line).toBe(0);
  });
});

describe("the denylist file itself", () => {
  it("contains hashes and never plaintext", async () => {
    // A denylist of forbidden names, committed to a public repo, IS the leak
    // it prevents. The file must carry nothing but hashes, lengths and
    // non-identifying notes.
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const raw = await readFile(
      path.join(process.cwd(), "scripts", "lib", "confidential-terms.json"),
      "utf-8",
    );
    const terms = JSON.parse(raw) as ForbiddenTerm[];
    for (const t of terms) {
      expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof t.length).toBe("number");
      expect(typeof t.words).toBe("number");
      // The note is read by a human on failure; it must not identify anyone.
      expect(t.note.length).toBeLessThanOrEqual(40);
    }
    // Every key in the file is one of the four expected — a stray "term" or
    // "name" key holding plaintext would be the whole failure.
    const keys = new Set(terms.flatMap((t) => Object.keys(t)));
    expect([...keys].sort()).toEqual(["hash", "length", "note", "words"]);
  });
});
