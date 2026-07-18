/**
 * ABeam Workbench — facilitator notes never reach a client payload.
 *
 * This is the PR-5 seam contract, asserted now, before C8 exists to depend on it.
 *
 * Notes are the facilitator's private red-lines, typed in the room while the
 * client watches the projected view. Invariant 2: "C8 notes never reach a client
 * payload." The structural defence is that `DiscoveryNote` is its own table, so a
 * client read has to opt IN to leaking rather than remember to opt out — but
 * "nobody would do that" is not a control, so these tests make it fail loudly.
 *
 * Three independent angles, because one of them alone would rot:
 *   1. No client view model selects notes (static: the journey module never
 *      touches prisma.discoveryNote).
 *   2. The serializer allowlist has no mapper that could carry a note.
 *   3. /d/notes is write-only — no GET handler exists to fetch them back.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  allClientProcesses,
  clientValueStreams,
} from "@/lib/discovery/client-library";
import { toDiscoveryProcess, toDiscoveryValueStream } from "@/lib/discovery/serializers";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Anything that would betray a note if it appeared in a client payload. */
const NOTE_KEYS = ["note", "notes", "body", "facilitatorNote", "privateNote"];

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
}

describe("1 · no client view model reads the notes table", () => {
  /**
   * Matches the ACCESS, not the word.
   *
   * This guard bans reading the table, so it looks for `prisma.discoveryNote` /
   * `tx.discoveryNote`. A bare /discoveryNote/i also matches prose — it fired on
   * FacilitatorBar.tsx, whose comment explains that the field writes to
   * DiscoveryNote, and on nothing else. That is a false positive, and a guard
   * that cries wolf gets deleted.
   *
   * Contrast the vendor-term guard, which scans comments too and should: there
   * the WORD is the offence. Here the offence is a query.
   */
  const NOTE_ACCESS = /\b(?:prisma|tx|db)\s*\.\s*discoveryNote\b/;

  it("the access detector matches a real query and ignores prose", () => {
    expect(NOTE_ACCESS.test("await prisma.discoveryNote.findMany()")).toBe(true);
    expect(NOTE_ACCESS.test("await tx.discoveryNote.create({})")).toBe(true);
    expect(NOTE_ACCESS.test("// writes to DiscoveryNote — consultant-visible only")).toBe(false);
  });

  it("journey.ts never queries the notes table", () => {
    // journey.ts is the ONLY module /d pages get their data from. If a note is
    // ever to reach a client, it has to come through here.
    expect(read("src/lib/discovery/external/journey.ts")).not.toMatch(NOTE_ACCESS);
  });

  it("no (external)/d page or component queries prisma.discoveryNote", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(join(ROOT, "src/app/(external)/d"));
    walk(join(ROOT, "src/components/discovery"));

    const offenders = files
      .filter((f) => NOTE_ACCESS.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(ROOT + "/", ""))
      // The write route is the one legitimate toucher — and it only creates.
      .filter((f) => f !== "src/app/(external)/d/notes/route.ts");

    expect(
      offenders,
      `These client-surface files touch the notes table:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("2 · the serializer allowlist cannot carry a note", () => {
  it("no note-shaped key appears at any depth of a serialized process", () => {
    const keys = new Set<string>();
    for (const p of allClientProcesses().slice(0, 200)) collectKeys(toDiscoveryProcess(p), keys);
    expect(NOTE_KEYS.filter((k) => keys.has(k))).toEqual([]);
  });

  it("no note-shaped key appears at any depth of a serialized value stream", () => {
    const keys = new Set<string>();
    for (const vs of clientValueStreams()) collectKeys(toDiscoveryValueStream(vs), keys);
    expect(NOTE_KEYS.filter((k) => keys.has(k))).toEqual([]);
  });
});

describe("3 · /d/notes is write-only", () => {
  const src = read("src/app/(external)/d/notes/route.ts");

  it("exports POST", () => {
    expect(src).toMatch(/export async function POST/);
  });

  it("exports NO GET — the client can write a note but never read one back", () => {
    expect(src).not.toMatch(/export async function GET/);
  });

  it("does not export any other reader verb", () => {
    for (const verb of ["GET", "HEAD", "PUT", "PATCH", "DELETE"]) {
      expect(src, `/d/notes must not export ${verb}`).not.toMatch(
        new RegExp(`export async function ${verb}\\b`),
      );
    }
  });

  it("its success response carries no note content", () => {
    // A route that echoed the saved body back would hand a client its own
    // facilitator's private text.
    expect(src).toMatch(/NextResponse\.json\(\{ ok: true \}\)/);
  });

  it("the write route only creates — it never reads notes back", () => {
    // `create` is the only verb that should touch this table from /d.
    const accesses = [...src.matchAll(/\b(?:prisma|tx|db)\s*\.\s*discoveryNote\s*\.\s*(\w+)/g)].map(
      (m) => m[1],
    );
    expect(accesses).toEqual(["create"]);
  });
});

describe("the notes table is separate from decisions, by design", () => {
  it("DiscoveryDecision has no note/body column", () => {
    const schema = read("prisma/schema.prisma");
    const model = /model DiscoveryDecision \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model.length).toBeGreaterThan(0);
    // A note column here would ride along with every decision read, and privacy
    // would depend on every future `select` remembering to exclude it.
    expect(model).not.toMatch(/\bnote\b|\bbody\b/i);
  });
});
