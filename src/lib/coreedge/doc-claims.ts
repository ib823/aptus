/**
 * The document lint (roadmap P0.16): no "planned" next to a shipped feature.
 *
 * A document says a feature is planned, not yet built, coming soon, pending
 * merge. The feature ships. The sentence stays, and an auditor reads it. This
 * module finds those sentences: a term naming a feature the capability
 * registry marks shipped (src/lib/coreedge/shipped-features.ts), within a few
 * words of not-built wording, in the same sentence or table row.
 *
 * Pure: text in, findings out. scripts/coreedge/check-doc-claims.ts reads the
 * files; docs/runbooks/coreedge-doc-claims.md says what to do with a finding.
 *
 * Two markers, both HTML or code comments so a reader never sees them:
 *   doc-claims: allow <feature-id>: <reason>
 *       on the line of the sentence or the line just above it. The sentence
 *       is right as it stands (it names a shipped feature and something else
 *       that is planned, say). The reason is required.
 *   doc-claims: historical
 *       in the first lines of a file that is a record of the past (a build
 *       specification, an audit). The file is not scanned, but it must say
 *       in visible text, near the top, that it is historical, so a reader is
 *       told what the lint was told.
 */

import type { DocumentedFeature } from "./shipped-features";

/** Words that say something does not exist yet. Case-insensitive. */
export const NOT_BUILT_WORDING: readonly RegExp[] = [
  // "a planned rotation" means a scheduled one, not an unbuilt feature.
  /\bplanned\b(?!\s+(?:rotations?|maintenance|outages?|downtime|changes?|cut-?overs?)\b)/i,
  /\bnot (?:yet )?(?:been )?(?:built|implemented|shipped|merged|wired|callable|available)\b/i,
  /\bnot built yet\b/i,
  /\bnothing (?:is )?(?:yet )?callable\b/i,
  /\bisn['’]t (?:yet )?(?:built|implemented)\b/i,
  /\b(?:yet|still) to (?:be )?(?:built|build|implemented|implement|shipped|ship)\b/i,
  /\bto be built\b/i,
  /\bcoming soon\b/i,
  /\bpending merge\b/i,
  /\bunmerged\b/i,
  /\bnot (?:yet )?in production\b/i,
  /\b(?:in|for) a future (?:release|version|phase)\b/i,
  /\bwill be (?:built|implemented)\b/i,
];

/** How many words may separate a feature term from the wording. */
export const PROXIMITY_WORDS = 12;

export interface ProseUnit {
  /** 1-based line where the unit starts. */
  readonly line: number;
  readonly text: string;
  /** Feature ids an allow marker on this line or the one above exempts. */
  readonly allowed: readonly string[];
}

export interface StaleClaim {
  readonly file: string;
  readonly line: number;
  readonly featureId: string;
  readonly term: string;
  readonly wording: string;
  readonly text: string;
}

export interface MarkerProblem {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const ALLOW_MARKER = /doc-claims:\s*allow\s+([a-z0-9-]+)\s*(?::\s*(.*?))?\s*(?:-->|\*\/|$)/gi;
const HISTORICAL_MARKER = /doc-claims:\s*historical\b/i;
/** How far down a file the historical marker, and its visible notice, may sit. */
export const HISTORICAL_HEADER_LINES = 20;

export type DocKind = "markdown" | "html" | "code";

export function docKind(file: string): DocKind | null {
  if (/\.mdx?$/i.test(file)) return "markdown";
  if (/\.html?$/i.test(file)) return "html";
  if (/\.(?:[cm]?[jt]sx?)$/i.test(file)) return "code";
  return null;
}

/* ── markers ──────────────────────────────────────────────────────────── */

interface Markers {
  readonly allowByLine: ReadonlyMap<number, readonly string[]>;
  readonly problems: readonly MarkerProblem[];
}

function readMarkers(file: string, text: string, knownIds: ReadonlySet<string>): Markers {
  const allowByLine = new Map<number, string[]>();
  const problems: MarkerProblem[] = [];
  text.split("\n").forEach((lineText, i) => {
    for (const m of lineText.matchAll(ALLOW_MARKER)) {
      const id = m[1]?.toLowerCase() ?? "";
      const reason = (m[2] ?? "").trim();
      if (!knownIds.has(id)) {
        problems.push({
          file,
          line: i + 1,
          message: `doc-claims allow marker names "${id}", which is not a feature in shipped-features.ts.`,
        });
        continue;
      }
      if (reason.length < 10) {
        problems.push({
          file,
          line: i + 1,
          message: `doc-claims allow marker for "${id}" gives no reason (write "doc-claims: allow ${id}: <why the sentence is right>").`,
        });
        continue;
      }
      for (const line of [i + 1, i + 2]) allowByLine.set(line, [...(allowByLine.get(line) ?? []), id]);
    }
  });
  return { allowByLine, problems };
}

/**
 * Whether the file declares itself historical. Null when it does not; a
 * problem when it does but never says so in text a reader sees.
 */
export function historicalDeclaration(
  file: string,
  text: string,
  kind: DocKind,
): { historical: boolean; problem?: MarkerProblem } {
  const head = text.split("\n").slice(0, HISTORICAL_HEADER_LINES);
  const markerAt = head.findIndex((l) => HISTORICAL_MARKER.test(l));
  if (markerAt < 0) return { historical: false };
  const visible = head.map((l) => (kind === "code" ? l : l.replace(/<!--.*?-->/g, ""))).join("\n");
  const shown =
    kind === "code"
      ? /\bhistorical\b/i.test(visible.replace(HISTORICAL_MARKER, ""))
      : /\bhistorical\b/i.test(stripTags(visible));
  if (!shown) {
    return {
      historical: true,
      problem: {
        file,
        line: markerAt + 1,
        message: `Declared historical (doc-claims: historical) but the first ${HISTORICAL_HEADER_LINES} lines never tell a reader it is historical.`,
      },
    };
  }
  return { historical: true };
}

/* ── prose units ──────────────────────────────────────────────────────── */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rarr: "→",
  larr: "←",
  harr: "↔",
  middot: "·",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "));
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Sentences of a prose block. Splits after . ! ? and before a capital, a quote, a bracket or markup. */
export function sentences(block: string): string[] {
  return block
    .split(/(?<=[.!?])\s+(?=[A-Z"'“(*`_[])/)
    .map(collapse)
    .filter(Boolean);
}

interface RawUnit {
  readonly line: number;
  readonly text: string;
  /** Table rows are not split into sentences: a status column says what its row's feature is. */
  readonly row: boolean;
}

function markdownUnits(text: string): RawUnit[] {
  const lines = text.split("\n");
  const units: RawUnit[] = [];
  let block: string[] = [];
  let blockLine = 0;
  let fence: string | null = null;
  const flush = () => {
    if (block.length) units.push({ line: blockLine, text: block.join(" "), row: false });
    block = [];
  };
  lines.forEach((raw, i) => {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(raw);
    if (fence) {
      if (fenceMatch && fenceMatch[1]?.startsWith(fence)) fence = null;
      return;
    }
    if (fenceMatch) {
      flush();
      fence = fenceMatch[1] ?? "```";
      return;
    }
    const line = raw.replace(/<!--.*?-->/g, " ");
    if (!line.trim()) {
      flush();
      return;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      if (!/^\s*\|[\s:|-]+\|?\s*$/.test(line)) units.push({ line: i + 1, text: line, row: true });
      return;
    }
    const startsItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line) || /^\s*#{1,6}\s/.test(line) || /^\s*>/.test(line);
    if (startsItem) flush();
    if (!block.length) blockLine = i + 1;
    block.push(line.replace(/^\s*(?:[-*+]|\d+[.)]|#{1,6}|>)\s+/, ""));
    if (/^\s*#{1,6}\s/.test(line)) flush();
  });
  flush();
  return units;
}

/** Elements whose end closes a unit. A table row is one unit; its cells are joined. */
const HTML_BLOCK_END = /<\/(?:tr|li|p|h[1-6]|div|section|header|footer|blockquote|ul|ol|table)\s*>|<br\s*\/?>/gi;

function htmlUnits(text: string): RawUnit[] {
  // Blank out what is never prose, keeping newlines so line numbers hold.
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  const body = text
    .replace(/<style[\s\S]*?<\/style>/gi, blank)
    .replace(/<script[\s\S]*?<\/script>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
  const units: RawUnit[] = [];
  let start = 0;
  const lineAt = (offset: number) => body.slice(0, offset).split("\n").length;
  const push = (end: number, closing: string) => {
    const segment = body.slice(start, end);
    // The unit starts where its text does, past any leading whitespace and tags.
    const lead = /^(?:\s+|<[^>]*>)*/.exec(segment)?.[0].length ?? 0;
    const content = collapse(stripTags(segment.replace(/<\/t[dh]\s*>/gi, " | ")));
    if (content) units.push({ line: lineAt(start + lead), text: content, row: /^<\/tr/i.test(closing) });
  };
  for (const m of body.matchAll(HTML_BLOCK_END)) {
    const end = (m.index ?? 0) + m[0].length;
    push(end, m[0]);
    start = end;
  }
  push(body.length, "");
  return units;
}

function codeUnits(text: string): RawUnit[] {
  const units: RawUnit[] = [];
  const lineAt = (offset: number) => text.slice(0, offset).split("\n").length;
  // Block comments, then runs of line comments. Strings are not prose.
  for (const m of text.matchAll(/\/\*([\s\S]*?)\*\//g)) {
    const first = lineAt(m.index ?? 0);
    let para: string[] = [];
    let paraLine = first;
    const end = () => {
      const t = collapse(para.join(" "));
      if (t) units.push({ line: paraLine, text: t, row: false });
      para = [];
    };
    (m[1] ?? "").split("\n").forEach((l, i) => {
      const content = l.replace(/^\s*\*+\s?/, "").replace(/^\s*\/?\*+/, "");
      if (!content.trim()) {
        end();
        return;
      }
      if (!para.length) paraLine = first + i;
      para.push(content);
    });
    end();
  }
  let run: string[] = [];
  let runLine = 0;
  const flush = () => {
    if (run.length) units.push({ line: runLine, text: collapse(run.join(" ")), row: false });
    run = [];
  };
  text.split("\n").forEach((line, i) => {
    const m = /^\s*\/\/(.*)$/.exec(line);
    if (!m) {
      flush();
      return;
    }
    if (!run.length) runLine = i + 1;
    run.push(m[1] ?? "");
  });
  flush();
  return units;
}

/** The prose of a file, as sentences and table rows, with the allow markers that apply to each. */
export function proseUnits(
  file: string,
  text: string,
  kind: DocKind,
  knownIds: ReadonlySet<string>,
): { units: ProseUnit[]; problems: MarkerProblem[] } {
  const { allowByLine, problems } = readMarkers(file, text, knownIds);
  const raw = kind === "markdown" ? markdownUnits(text) : kind === "html" ? htmlUnits(text) : codeUnits(text);
  const units = raw.flatMap((u) => {
    // A marker applies to the unit starting on its own line or the next one.
    const allowed = [...new Set(allowByLine.get(u.line) ?? [])];
    const parts = u.row ? [collapse(u.text)] : sentences(u.text);
    return parts.map((text) => ({ line: u.line, text, allowed }));
  });
  return { units, problems: [...problems] };
}

/* ── the check ────────────────────────────────────────────────────────── */

function wordsBetween(
  text: string,
  a: { index: number; length: number },
  b: { index: number; length: number },
): number {
  const [first, second] = a.index <= b.index ? [a, b] : [b, a];
  const gap = text.slice(first.index + first.length, second.index).trim();
  return gap ? gap.split(/\s+/).length : 0;
}

function allMatches(text: string, re: RegExp): { index: number; text: string }[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return [...text.matchAll(g)].map((m) => ({ index: m.index ?? 0, text: m[0] }));
}

const OPEN_QUOTES = new Set(['"', "“", "'", "‘", "`"]);
const CLOSE_QUOTES = new Set(['"', "”", "'", "’", "`"]);

function isQuoted(text: string, m: { index: number; text: string }): boolean {
  return OPEN_QUOTES.has(text[m.index - 1] ?? "") && CLOSE_QUOTES.has(text[m.index + m.text.length] ?? "");
}

/** The stale claims in one unit: a shipped feature's term near not-built wording. */
export function staleClaimsIn(unit: ProseUnit, features: readonly DocumentedFeature[], file = ""): StaleClaim[] {
  // Wording in quotes is mentioned, not used: a document discussing the word "planned" is not calling anything planned.
  const wording = NOT_BUILT_WORDING.flatMap((re) => allMatches(unit.text, re)).filter((w) => !isQuoted(unit.text, w));
  if (!wording.length) return [];
  const found: StaleClaim[] = [];
  for (const feature of features) {
    if (unit.allowed.includes(feature.id)) continue;
    const terms = feature.terms.flatMap((re) => allMatches(unit.text, re));
    let hit: StaleClaim | null = null;
    for (const t of terms) {
      for (const w of wording) {
        if (
          wordsBetween(
            unit.text,
            { index: t.index, length: t.text.length },
            { index: w.index, length: w.text.length },
          ) <= PROXIMITY_WORDS
        ) {
          hit = { file, line: unit.line, featureId: feature.id, term: t.text, wording: w.text, text: unit.text };
          break;
        }
      }
      if (hit) break;
    }
    if (hit) found.push(hit);
  }
  return found;
}

export interface FileResult {
  readonly claims: readonly StaleClaim[];
  readonly problems: readonly MarkerProblem[];
  readonly historical: boolean;
}

/** Check one file's text. Historical files are not scanned (but must say they are historical). */
export function checkDocument(
  file: string,
  text: string,
  shipped: readonly DocumentedFeature[],
  allFeatureIds: ReadonlySet<string>,
): FileResult {
  const kind = docKind(file);
  if (!kind) return { claims: [], problems: [], historical: false };
  const hist = historicalDeclaration(file, text, kind);
  if (hist.historical) return { claims: [], problems: hist.problem ? [hist.problem] : [], historical: true };
  const { units, problems } = proseUnits(file, text, kind, allFeatureIds);
  return { claims: units.flatMap((u) => staleClaimsIn(u, shipped, file)), problems, historical: false };
}
