/**
 * Studio must not contradict itself about tenants.
 *
 * The Home page announced "No SAP tenant connected" directly beneath a switcher
 * listing two working tenants, because it counted SapConnection rows while the
 * switcher used the resolver. Both statements came from real queries; they just
 * asked different questions. For a console whose whole claim is honest status,
 * two surfaces disagreeing about the same fact is the worst kind of bug — every
 * number on the page is individually defensible and the page as a whole lies.
 *
 * These are source-level guards. The pages are async server components that pull
 * in Prisma, next/headers and the React server runtime; standing all that up
 * would test the mocks more than the code. What actually went wrong was a page
 * reaching for the wrong data source, and that is visible in the source.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

/**
 * Strip comments so prose about `sapConnection` cannot satisfy or trip a check.
 *
 * LINE COMMENTS FIRST. A `//` comment mentioning a glob like `/api/sap/tdd/*`
 * ends in `/*`; strip block comments first and that opens a phantom block that
 * runs to the next `*` + `/` anywhere in the file, swallowing real code. That is
 * not hypothetical — it silently ate the call this file exists to assert, and the
 * test failed on source that was perfectly correct.
 */
function code(src: string): string {
  return src
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

const HOME = "src/app/(studio)/studio/page.tsx";
const LAYOUT = "src/app/(studio)/layout.tsx";
const TEST_CONSOLE = "src/app/(studio)/studio/test/page.tsx";
const TOPBAR = "src/components/studio/StudioTopBar.tsx";

describe("every tenant-aware surface uses one resolver", () => {
  it("the comment stripper works (guard against a dead guard)", () => {
    // If code() stopped stripping, the checks below would pass on prose.
    expect(code("// sapConnection.count()")).not.toContain("sapConnection");
    expect(code("const x = sapConnection;")).toContain("sapConnection");
    expect(code("/* sapConnection */")).not.toContain("sapConnection");
    // The ordering bug that made this helper eat real code: a line comment
    // ending in a glob must not open a block comment.
    expect(code("// see /api/sap/tdd/*\nconst keep = resolveStudioTenants(x);")).toContain(
      "resolveStudioTenants(x)",
    );
  });

  for (const file of [HOME, LAYOUT, TEST_CONSOLE]) {
    it(`${file.split("/").pop()} resolves tenants through resolveStudioTenants`, () => {
      // A CALL, not merely an import — swapping the call back to a Prisma count
      // leaves the import line behind, and a test satisfied by that would go on
      // passing through the exact regression it exists to catch.
      expect(code(read(file))).toMatch(/resolveStudioTenants\s*\(/);
    });

    it(`${file.split("/").pop()} does not query sapConnection directly`, () => {
      // Connections is the one legitimate exception — it manages the rows
      // themselves — and it is deliberately absent from this list.
      expect(
        code(read(file)),
        `${file} reaches past the resolver; it will disagree with the switcher`,
      ).not.toMatch(/prisma\s*\.\s*sapConnection/);
    });
  }
});

describe("the Home page tells one story", () => {
  const home = code(read(HOME));

  it("gates the empty state on all tenants, not just stored connections", () => {
    // The exact regression: `connectionCount === 0` was true while two env
    // tenants were live and listed one line above.
    expect(home).toMatch(/tenants\.length === 0/);
    expect(home).not.toMatch(/connectionCount/);
  });

  it("has a distinct state for running on the shared tenant", () => {
    // Falling back is fine; being silent about it is not. A consultant must not
    // believe a shared demo tenant is this client's own SAP.
    expect(read(HOME)).toContain("shared environment tenant");
  });

  it("offers Discover as the second door when a tenant exists", () => {
    // Design copy: "Start by registering one, or explore what this tenant can do."
    expect(home).toContain("/studio/discover");
  });
});

describe("the top bar", () => {
  const topbar = read(TOPBAR);
  const shell = read("src/components/studio/StudioShell.tsx");
  const layout = read(LAYOUT);

  it("no longer shows the deployment environment as a bare badge", () => {
    // It read, inches from a tenant switcher, as "you are pointed at production
    // SAP". The design's chip describes the TENANT; we have no per-tenant
    // environment field, so there is nothing honest to render yet.
    for (const [name, src] of [["topbar", topbar], ["shell", shell], ["layout", layout]] as const) {
      expect(code(src), `${name} still renders a deployment-env badge`).not.toMatch(
        /VERCEL_ENV|resolveEnvironment/,
      );
    }
  });

  it("carries the tenant source through so 'shared' is stated, not implied", () => {
    expect(topbar).toContain('source: "connection" | "environment"');
    expect(topbar).toContain("shared environment tenant");
  });

  it("keeps the design's provenance line", () => {
    // The one piece of copy that tells a user tenants cannot be typed into a URL.
    expect(topbar).toContain("Resolved from your access");
  });

  it("signs out through the route that also revokes the session row", () => {
    // next-auth's signOut() clears its own cookies but leaves the custom session
    // row live; the middleware would re-mint a session from the surviving JWT and
    // sign the user straight back in.
    expect(topbar).toContain("/api/auth/logout");
    expect(code(topbar)).not.toContain("signOut(");
  });

  it("exposes the menus to assistive tech and closes them on Escape", () => {
    expect(topbar).toContain("aria-expanded");
    expect(topbar).toContain('aria-haspopup="menu"');
    expect(topbar).toContain('aria-haspopup="listbox"');
    expect(topbar).toMatch(/e\.key === "Escape"/);
  });
});
