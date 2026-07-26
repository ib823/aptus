/**
 * Connections CRUD — and the two things it must never do.
 *
 * `upsertSapConnection` existed with no route caller, so a connection could only
 * be created by hand against the database. The Connections screen said "a
 * connection is added by a platform administrator" and offered nothing — the
 * same shape as the solutions dead end, on the screen that holds a client's SAP
 * credentials.
 *
 * The two properties worth guarding are not "the form works":
 *
 *   1. SECRETS ARE WRITE-ONLY. They enter, get sealed, and no read path selects
 *      the column. Not filtered on the way out — never read in the first place.
 *   2. A PARTIAL WRITE CANNOT EMPTY THE BUNDLE. upsertSapConnection reseals on
 *      every write, so a metadata-only save that omitted secrets would store an
 *      empty bundle and break a working connection — failing later, at the next
 *      SAP call, far from the edit that caused it. Hence POST replaces (secrets
 *      required) and PATCH cannot reach the column at all.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { sanitizeTenantKey } from "@/lib/sap-public/tdd-connector";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

function code(src: string): string {
  return src
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}
const flat = (src: string) => src.replace(/\s+/g, " ");

const ROUTE = "src/app/api/studio/connections/route.ts";
const UI = "src/components/studio/ConnectionsClient.tsx";

describe("secrets are write-only", () => {
  const route = code(read(ROUTE));

  it("no handler selects the sealed column", () => {
    // Redaction by absence. A `select` naming secretsCiphertext is the only way
    // this endpoint could leak one.
    expect(route).not.toContain("secretsCiphertext");
  });

  it("the audit records that secrets changed, never what they became", () => {
    // An audit trail quoting a password undoes the point of sealing it.
    expect(route).toContain("secretsRotated");
    for (const secret of ["password", "clientSecret", "bearerToken", "writeSecret"]) {
      const auditBlocks = route.match(/after: \{[\s\S]*?\}/g) ?? [];
      for (const block of auditBlocks) {
        expect(block, `audit payload must not carry ${secret}`).not.toMatch(
          new RegExp(`\\b${secret}\\b`),
        );
      }
    }
  });

  it("the UI never tries to prefill a secret", () => {
    // There is nothing to prefill — the read path does not select it — so an
    // attempt would silently render empty and be mistaken for "no password set".
    const ui = code(read(UI));
    expect(ui).not.toMatch(/defaultValue=\{[^}]*(password|Secret|Token)/i);
  });
});

describe("a partial write cannot empty the credential bundle", () => {
  const route = code(read(ROUTE));

  it("PATCH cannot reach secrets or call the upsert", () => {
    const patch = route.slice(route.indexOf("export async function PATCH"));
    expect(patch).not.toContain("upsertSapConnection");
    expect(patch).not.toContain("secrets");
  });

  it("PATCH only accepts the two toggles", () => {
    const schema = route.match(/const patchSchema = z\.object\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(schema, "patchSchema not found").not.toBe("");
    expect(schema).toContain("isActive");
    expect(schema).toContain("writeEnabled");
    expect(schema).not.toMatch(/baseUrl|authType|password|label/);
  });

  it("refuses to enable writes without the secret it cannot see", () => {
    // Flipping the switch on a connection that never had a write secret would
    // claim a capability that fails at the first attempt.
    expect(flat(route)).toMatch(/writeEnabled === true && !existing\.writeEnabled/);
  });

  it("the form says saving replaces the credentials", () => {
    expect(flat(read(UI))).toMatch(/replaces.{0,80}credentials/i);
  });
});

describe("input validation", () => {
  const route = code(read(ROUTE));

  it("requires https — these carry credentials on every call", () => {
    expect(route).toMatch(/startsWith\("https:\/\/"\)/);
  });

  it("requires the fields each auth type actually needs", () => {
    // A "basic" connection with no password stores a credential that cannot
    // authenticate, and only fails at the first real SAP call.
    for (const field of ["username", "password", "bearerToken", "clientId", "clientSecret", "oauthTokenUrl"]) {
      expect(route, `${field} must be conditionally required`).toContain(field);
    }
    expect(route).toContain("superRefine");
  });

  it("scopes the toggle lookup to the caller's organization", () => {
    // A bare update by id would let one organization deactivate another's.
    const patch = route.slice(route.indexOf("export async function PATCH"));
    expect(flat(patch)).toMatch(/where: \{ id, organizationId \}/);
  });

  it("is builder-gated, like testing a connection already was", () => {
    expect(route).toContain("canMutateStudio");
  });
});

describe("tenant keys normalize consistently", () => {
  it("matches how env tenant keys are derived", () => {
    // The key is what stored probes are recorded under. Two spellings resolving
    // differently would split one tenant's probe history in two.
    expect(sanitizeTenantKey("X5M/100")).toBe("x5m-100");
    expect(sanitizeTenantKey("  Customizing X5M 100  ")).toBe("customizing-x5m-100");
    expect(sanitizeTenantKey("--dev--")).toBe("dev");
  });

  it("the route rejects a key that normalizes to nothing", () => {
    expect(sanitizeTenantKey("///")).toBe("");
    expect(code(read(ROUTE))).toMatch(/if \(!key\) return studioError/);
  });
});

describe("the screen offers what it names", () => {
  const ui = read(UI);

  it("the empty state includes the form rather than naming who could add one", () => {
    expect(ui).toContain("ConnectionForm");
    expect(ui, "the old copy pointed at an administrator and offered nothing").not.toMatch(
      /added by a platform administrator/,
    );
  });

  it("deactivates rather than deletes", () => {
    // A connection is referenced by stored probes and audit rows; deleting it
    // would orphan the record of what was done through it.
    expect(ui).toContain("Deactivate");
    expect(code(ui)).not.toMatch(/method:\s*"DELETE"/);
  });
});
