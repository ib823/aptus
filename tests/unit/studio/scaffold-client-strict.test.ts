// @vitest-environment node
/**
 * The starter kit's generated client.ts compiles under `strict` (P0.4).
 *
 * It did not: the response body was cast `as typeof json`, which reads the
 * variable's type narrowed to `null` by its initialiser, so every later read
 * of it was `never` and the file failed `tsc --strict` in the developer's own
 * repository — the one place it is ever compiled. An interface or solution
 * name containing a comment terminator broke the header comment too.
 *
 * The same check runs as its own CI step (`pnpm check:scaffold-client`); this
 * keeps it in the unit suite, where a change to the generator meets it first.
 */

import { describe, expect, it } from "vitest";

import { checkGeneratedClients, clientVariants, compilerConfigs, compileClient } from "../../../scripts/lib/scaffold-client-check";

describe("generated client.ts", () => {
  it("compiles cleanly for every variant under every configuration", () => {
    const failures = checkGeneratedClients();
    expect(
      failures.map((f) => `${f.variant} — ${f.config}: ${f.diagnostics.slice(0, 3).join(" | ")}`),
    ).toEqual([]);
  }, 120_000);

  it("the check is not vacuous: a planted type error is reported", () => {
    const [variant] = clientVariants();
    const [config] = compilerConfigs();
    const diagnostics = compileClient(`${variant!.source}\nconst broken: number = "not a number";\n`, config!.options);
    expect(diagnostics.join("\n")).toMatch(/TS2322/);
  }, 60_000);
});
