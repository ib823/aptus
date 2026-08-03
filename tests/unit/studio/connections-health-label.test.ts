/**
 * Connections — the health chip must not borrow a word this table already spent.
 *
 * The Connections table shows two facts side by side that a reader will merge if
 * they are named the same thing:
 *
 *   HEALTH  — what the last probe against the tenant returned. Historical, and
 *             it does not move when you enable or disable the connection.
 *   ACTIVE  — whether the connection is enabled to carry traffic. That is what
 *             the Activate / Deactivate button toggles.
 *
 * The shared honest-status vocabulary calls a live 200 "Activated", which is the
 * right word for a CAPABILITY (the service is activated on the tenant) and the
 * wrong word here. Rendering it unmodified produced a row reading
 *
 *     ● Activated   |   no   |   [ Activate ]
 *
 * on a connection that had just been deactivated — which reads as the console
 * contradicting itself, and was reported as exactly that.
 *
 * Source-level, because the guarantee is a property of what the component
 * renders, not of a particular runtime response.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

/** Strip comments so these guards fire on code, never on prose that explains it. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

const CLIENT = "src/components/studio/ConnectionsClient.tsx";
const CHIP = "src/components/studio/StudioStatusChip.tsx";

describe("the connections health chip does not collide with the Active column", () => {
  it("overrides the ACTIVATED label rather than rendering the shared one", () => {
    const src = code(read(CLIENT));
    // The chip must be given an explicit label, not left to fall back to LABELS.
    expect(src).toMatch(/<StudioStatusChip[^>]*\blabel=/);
    expect(src).toMatch(/healthLabel/);
  });

  it("renames only ACTIVATED, so the rest of the console still reads as one system", () => {
    const src = code(read(CLIENT));
    const fn = src.slice(src.indexOf("function healthLabel"));
    expect(fn).toContain('"Reachable"');
    // Every other status falls through to the shared vocabulary.
    expect(fn).toMatch(/ACTIVATED"?\s*\?\s*"Reachable"\s*:\s*undefined/);
  });

  it("never puts the word Activated in the connections table", () => {
    // The word belongs to the Active column and the Activate button in this
    // screen. If it reappears as a health label, the original report is back.
    const src = code(read(CLIENT));
    const activatedAsLabel = /label=\{?["']Activated/.test(src) || /["']Activated["']/.test(src);
    expect(activatedAsLabel).toBe(false);
  });

  it("still distinguishes health from active — they read different fields", () => {
    const src = code(read(CLIENT));
    // Health comes from the probe record; Active comes from the row's own flag.
    expect(src).toMatch(/healthToStatus\(\s*c\.lastValidationStatus\s*\)/);
    expect(src).toMatch(/c\.isActive\s*\?/);
  });

  it("leaves the shared vocabulary's own ACTIVATED label alone", () => {
    // The fix is local to this table. A capability probe returning 200 is still
    // correctly called "Activated" everywhere else.
    expect(code(read(CHIP))).toMatch(/ACTIVATED:\s*"Activated"/);
  });
});
