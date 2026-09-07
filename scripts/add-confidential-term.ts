/**
 * Add a term to the confidentiality denylist, without writing it anywhere.
 *
 *   pnpm guard:add-term -- --note "client A" --term "<the term>"
 *
 * Or, to keep the term out of your shell history entirely, omit --term and
 * type it at the prompt:
 *
 *   pnpm guard:add-term -- --note "client A"
 *
 * The term is hashed and the hash is appended to
 * scripts/lib/confidential-terms.json. The plaintext is never printed, never
 * logged, and never written to disk.
 *
 * `--note` must not identify the client either: "client A" is right,
 * "the Malaysian holding company" defeats the purpose and is rejected on a
 * best-effort basis by requiring the note to be short and to contain none of
 * the term's own words.
 */
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { normalise, termHash, type ForbiddenTerm } from "./lib/confidential-terms";

const TERMS_FILE = path.join(__dirname, "lib", "confidential-terms.json");

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close();
      resolve(a);
    });
  });
}

async function main(): Promise<void> {
  const note = arg("--note");
  if (!note) throw new Error('--note is required, e.g. --note "client A"');
  if (note.length > 40) throw new Error("--note must be 40 characters or fewer — it is a label, not a description");

  const term = arg("--term") ?? (await promptHidden("term (not echoed to any file): "));
  const n = normalise(term);
  if (n.length < 4) throw new Error("term normalises to fewer than 4 characters — too short to be safe to match on");

  // A note that repeats the term's own words would defeat the whole design.
  const noteWords = new Set(normalise(note).split(" "));
  for (const w of n.split(" ")) {
    if (noteWords.has(w)) throw new Error("--note contains a word from the term itself; choose a non-identifying label");
  }

  const existing: ForbiddenTerm[] = JSON.parse(readFileSync(TERMS_FILE, "utf-8")) as ForbiddenTerm[];
  const hash = termHash(term);
  if (existing.some((t) => t.hash === hash)) {
    console.error("already present — nothing to do");
    return;
  }
  existing.push({ hash, length: n.length, words: n.split(" ").length, note });
  existing.sort((a, b) => a.hash.localeCompare(b.hash));
  writeFileSync(TERMS_FILE, `${JSON.stringify(existing, null, 2)}\n`);
  // Deliberately does not echo the term, its length, or its word count.
  console.error(`added. ${existing.length} term(s) now on the denylist.`);
}

const executedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith("add-confidential-term.ts");
if (executedDirectly) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
