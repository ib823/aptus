/**
 * Connections — the secret-safety proof.
 *
 * The Connections screen is the one place in Studio that stands next to stored
 * SAP credentials, so "no route or response can surface a secret" is asserted
 * here rather than assumed. The strongest form of that guarantee is structural:
 * the queries use an explicit `select` allow-list that does not name
 * `secretsCiphertext`, so the column is never read out of the database at all.
 * Redaction by absence beats redaction by filtering, because there is no step
 * anyone can forget.
 *
 * These are source-level assertions because the guarantee IS a property of the
 * source (which columns are selected), not of a particular runtime response.
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

const LIST_ROUTE = "src/app/api/studio/connections/route.ts";
const TEST_ROUTE = "src/app/api/studio/connections/[id]/test/route.ts";
const PAGE = "src/app/(studio)/studio/connections/page.tsx";
const CLIENT = "src/components/studio/ConnectionsClient.tsx";
const HEALTH = "src/lib/studio/connection-health.ts";

describe("the sealed column is never read", () => {
  it("no connections surface selects secretsCiphertext", () => {
    for (const f of [LIST_ROUTE, TEST_ROUTE, PAGE, CLIENT]) {
      expect(code(read(f)), `${f} must not select the sealed column`).not.toContain(
        "secretsCiphertext",
      );
    }
  });

  it("no connections surface opens or decrypts a secret bundle", () => {
    for (const f of [LIST_ROUTE, TEST_ROUTE, PAGE, CLIENT]) {
      const src = code(read(f));
      expect(src, `${f} must not open secrets`).not.toContain("openSecrets");
      expect(src, `${f} must not decrypt`).not.toContain("decryptSecret");
    }
  });

  it("the list endpoint uses an explicit select allow-list, not a bare findMany", () => {
    // A findMany without `select` returns EVERY column — including the sealed
    // one. The allow-list is the whole guarantee, so its presence is pinned.
    const src = code(read(LIST_ROUTE));
    expect(src).toMatch(/findMany\(\{[\s\S]*?select:\s*\{/);
  });

  it("the client-facing type has no secret-shaped field", () => {
    const src = code(read(CLIENT));
    for (const forbidden of ["secret", "password", "clientSecret", "bearerToken", "ciphertext"]) {
      expect(
        new RegExp(`\\b${forbidden}\\s*:`, "i").test(src),
        `ConnectionsClient must not carry a "${forbidden}" field`,
      ).toBe(false);
    }
  });
});

describe("the probe keeps secrets and hosts out of its result", () => {
  it("returns only status, httpStatus, detail and duration", () => {
    const src = read(HEALTH);
    const iface = src.slice(
      src.indexOf("export interface ConnectionHealthResult"),
      src.indexOf("const DEFAULT_TIMEOUT_MS"),
    );
    expect(iface).toContain("status");
    expect(iface).toContain("httpStatus");
    expect(iface).toContain("detail");
    expect(iface).toContain("durationMs");
    // No field that could carry a URL, header, or response body outward.
    for (const forbidden of ["url", "baseUrl", "headers", "body", "authorization"]) {
      expect(
        new RegExp(`\\b${forbidden}\\??\\s*:`, "i").test(iface),
        `the probe result must not expose "${forbidden}"`,
      ).toBe(false);
    }
  });

  it("never interpolates the caught error into the client-visible detail", () => {
    // A fetch error commonly stringifies to include the host — and for the OAuth
    // path, the request. Neither belongs in a response.
    const src = code(read(HEALTH));
    const catchBlock = src.slice(src.indexOf("} catch (err) {"));
    expect(catchBlock).not.toMatch(/detail:\s*[`"'].*\$\{\s*err/);
    expect(catchBlock).not.toMatch(/detail:\s*String\(\s*err/);
    expect(catchBlock).not.toMatch(/detail:\s*err\b/);
  });
});

describe("the probe is bounded and read-only", () => {
  it("aborts on a timeout instead of hanging", () => {
    const src = code(read(HEALTH));
    expect(src).toContain("AbortController");
    expect(src).toMatch(/signal:\s*controller\.signal/);
  });

  it("only ever issues a GET", () => {
    const src = code(read(HEALTH));
    const methods = [...src.matchAll(/method:\s*"(\w+)"/g)].map((m) => m[1]);
    expect(methods).toEqual(["GET"]);
  });

  it("refuses to invent a probe path rather than reporting a misleading 404", () => {
    // Guessing a path would surface as NOT_FOUND, which reads as "the tenant
    // doesn't have this" when the truth is "we didn't know where to look".
    const src = read(HEALTH);
    expect(src).toContain("NO_PROBE_PATH");
  });
});
