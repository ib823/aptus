/**
 * Client-confidentiality guard — the CLI.
 *
 *   pnpm guard:confidentiality            scan every tracked file + path
 *   pnpm guard:confidentiality --staged   scan what is about to be committed
 *   pnpm guard:confidentiality --message <file>   also scan a commit message
 *
 * Exits non-zero on any hit, naming the file and line but NEVER the term —
 * a CI log on a public repository is as public as the repository.
 *
 * `--staged` is what the pre-commit hook runs: catching a term before the
 * commit is the only control that actually works, because git history is
 * permanent and a later deletion does not remove anything.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { scanPath, scanText, type ForbiddenTerm, type ScanHit } from "./lib/confidential-terms";

const ROOT = path.join(__dirname, "..");
const TERMS_FILE = path.join(__dirname, "lib", "confidential-terms.json");

/**
 * Files big enough that scanning them costs more than it protects. The
 * sap-references JSON exports run to tens of megabytes and are SAP's own
 * published content — no client material is ever written there. A client file
 * that large would be a different problem entirely, and .gitignore is what
 * keeps those out.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/** Extensions with no human-readable text to leak. */
const BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".mp4", ".webm", ".xlsx", ".docx", ".pptx",
]);

/**
 * Files to scan.
 *
 * `--staged` reads exactly what is about to be committed. Otherwise the scan
 * covers tracked files AND untracked-but-not-ignored ones: a leak sitting in
 * a new file is still a leak, and it is the state a full scan is most likely
 * to be run in. This module's own doc comment carried a real client name for
 * about ten minutes precisely because an earlier version scanned `ls-files`
 * only and the file was not yet tracked.
 *
 * Ignored files are excluded, deliberately: `.gitignore` is what keeps client
 * workbooks out of the repository, and scanning them would be both slow and
 * pointless — they cannot be committed.
 */
function filesToScan(staged: boolean): string[] {
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files", "--cached", "--others", "--exclude-standard"];
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
}

function main(): void {
  const terms: ForbiddenTerm[] = JSON.parse(readFileSync(TERMS_FILE, "utf-8")) as ForbiddenTerm[];
  const staged = process.argv.includes("--staged");
  const messageIdx = process.argv.indexOf("--message");
  const files = filesToScan(staged);
  const hits: ScanHit[] = [];

  for (const file of files) {
    hits.push(...scanPath(file, terms));
    if (BINARY.has(path.extname(file).toLowerCase())) continue;
    const abs = path.join(ROOT, file);
    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      continue; // deleted between listing and reading
    }
    if (size > MAX_BYTES) continue;
    let text: string;
    try {
      text = readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    hits.push(...scanText(text, terms, file));
  }

  if (messageIdx >= 0 && messageIdx + 1 < process.argv.length) {
    const msgFile = process.argv[messageIdx + 1]!;
    try {
      hits.push(...scanText(readFileSync(msgFile, "utf-8"), terms, "<commit message>"));
    } catch {
      // No message file (e.g. a non-commit invocation). Nothing to scan.
    }
  }

  const scope = staged ? "staged changes" : `${files.length} tracked + untracked file(s)`;
  if (hits.length === 0) {
    console.log(`confidentiality guard: clean — ${scope}, ${terms.length} term(s) on the denylist`);
    return;
  }

  console.error(`\nCONFIDENTIALITY GUARD FAILED — ${hits.length} hit(s)\n`);
  console.error("A term on the client denylist appears in the repository. ib823/aptus is");
  console.error("PUBLIC and git history is permanent: committing this and deleting it later");
  console.error("does NOT remove it. Fix it before committing.\n");
  for (const h of hits) {
    console.error(`  ${h.file}${h.line > 0 ? `:${h.line}` : " (path)"}  [${h.note}]`);
  }
  // The term itself is never printed: this output reaches CI logs, which on a
  // public repository are public.
  console.error("\nThe matched term is deliberately not shown. Open the file and look.\n");
  process.exit(1);
}

const executedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith("check-confidentiality.ts");
if (executedDirectly) main();
