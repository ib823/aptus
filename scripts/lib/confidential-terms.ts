/**
 * Client-confidentiality guard — the scanner.
 *
 * `ib823/aptus` is a PUBLIC repository. Client names, engagement details and
 * anything out of a client's RFP must never reach a tracked file, a commit
 * message, a branch name or a PR body. Git history is permanent: a term
 * committed and then deleted is still served by GitHub forever, so the only
 * effective control is one that fires BEFORE the commit.
 *
 * This exists because care was not enough. A client name was written into
 * tracked documentation in this repository without anyone checking that the
 * repository was public. A mechanical check does not get tired or distracted.
 *
 * ── THE DESIGN PROBLEM ────────────────────────────────────────────────────
 *
 * A denylist of forbidden names, committed to a public repo, IS the leak it
 * is meant to prevent. So this file holds no names. It holds
 * `sha256(normalised term)` and the term's normalised LENGTH, and nothing
 * else. A reader of this repository learns that N terms are forbidden and how
 * many characters each has. That is all.
 *
 * Lengths are stored because they make the scan tractable. Hashing every
 * 1-to-4-word window of a 91 MB repository is far too slow; hashing only the
 * windows whose length matches a forbidden term is fast, and a set of string
 * lengths discloses effectively nothing.
 *
 * ── WHAT IT CANNOT DO ─────────────────────────────────────────────────────
 *
 * This catches the exact terms it is given, after normalisation. It does not
 * catch a paraphrase, an abbreviation nobody registered, a client's project
 * codename, a person's name, a system hostname, or a verbatim requirement
 * sentence that names nobody. It is a net under the rule, not a substitute
 * for it: client material belongs in the scratchpad and the database, never
 * in the working tree.
 */
import { createHash } from "node:crypto";

/** Normalise for comparison: lowercase, punctuation to space, whitespace collapsed. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function termHash(term: string): string {
  return createHash("sha256").update(normalise(term)).digest("hex");
}

/**
 * The forbidden terms, as hashes. NEVER add a plaintext term to this file.
 *
 * To add one: `pnpm guard:add-term "<the term>"` prints the entry to paste,
 * and prints nothing else. The term itself must not appear in the command
 * history of a shared machine either — prefer running it with a leading space
 * where the shell is configured to skip such lines from history.
 *
 * `note` exists so a human can tell entries apart without naming them. Keep
 * it generic: "client A", never "the Malaysian holding company".
 */
export interface ForbiddenTerm {
  /** sha256 of the normalised term. */
  hash: string;
  /** Length of the normalised term, in characters. Used only to bound the scan. */
  length: number;
  /** Word count of the normalised term. Used only to bound the scan. */
  words: number;
  /** A non-identifying label, for humans reading a failure message. */
  note: string;
}

/**
 * Terms are loaded from `confidential-terms.json` beside this file rather than
 * inlined, so adding one is a data change that a reviewer can see is a data
 * change. The file contains hashes only.
 */
export interface ScanHit {
  file: string;
  line: number;
  note: string;
}

/** The longest window the scanner needs to build, derived from the term list. */
export function maxWords(terms: readonly ForbiddenTerm[]): number {
  return terms.reduce((n, t) => Math.max(n, t.words), 1);
}

/**
 * Scan one text for forbidden terms.
 *
 * Windows of 1..maxWords consecutive words are normalised and hashed, but only
 * when the window's length matches a forbidden term's length — which is why
 * the lengths are stored. Line numbers are reported so a failure is
 * actionable; the term is never echoed, because a CI log is public too.
 */
export function scanText(
  text: string,
  terms: readonly ForbiddenTerm[],
  file: string,
): ScanHit[] {
  if (terms.length === 0) return [];
  const byHash = new Map(terms.map((t) => [t.hash, t]));
  const lengths = new Set(terms.map((t) => t.length));
  const maxN = maxWords(terms);
  const hits: ScanHit[] = [];
  const seen = new Set<string>();

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const words = normalise(lines[i]!).split(" ").filter(Boolean);
    for (let start = 0; start < words.length; start++) {
      let window = "";
      for (let n = 0; n < maxN && start + n < words.length; n++) {
        window = n === 0 ? words[start]! : `${window} ${words[start + n]!}`;
        if (!lengths.has(window.length)) continue;
        const t = byHash.get(createHash("sha256").update(window).digest("hex"));
        if (!t) continue;
        const key = `${file}:${i + 1}:${t.hash}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ file, line: i + 1, note: t.note });
      }
    }
  }
  return hits;
}

/**
 * A path can leak as loudly as a file's contents — `docs/<client-name>-rfp.md`
 * needs no opening. Paths are scanned as a single line, with separators
 * treated as word breaks by `normalise`.
 *
 * This comment used to carry a real client name as its example. The guard did
 * not catch it, because the full scan read only git-tracked files and this
 * one was still untracked. Both were fixed: the example is a placeholder, and
 * the scan now includes untracked-but-not-ignored files.
 */
export function scanPath(path: string, terms: readonly ForbiddenTerm[]): ScanHit[] {
  return scanText(path, terms, path).map((h) => ({ ...h, line: 0 }));
}
