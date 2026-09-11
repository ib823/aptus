/**
 * AD-12 — an API key in its own header.
 *
 * Four auth types all produced `Authorization:`. SAP's Business Accelerator Hub
 * sandbox — the first thing a developer prototyping against SAP reaches for —
 * requires an `apikey` header and ignores `Authorization` entirely, so the
 * obvious first experiment failed after a real host had been typed in.
 */

import { randomBytes } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openSecrets, sealSecrets } from "@/lib/sap-public/connection-crypto";
import {
  buildAuthHeaderFromConnection,
  buildAuthHeadersFromConnection,
  DEFAULT_API_KEY_HEADER,
  toSapTenant,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";

const KEY_ENV = "SAP_CONNECTION_ENCRYPTION_KEY";
let originalKey: string | undefined;
beforeAll(() => {
  originalKey = process.env[KEY_ENV];
  process.env[KEY_ENV] = randomBytes(32).toString("hex");
});
afterAll(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
});

function connection(over: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "sandbox",
    label: "SAP sandbox",
    baseUrl: "https://sandbox.api.sap.com/s4hanacloud",
    authType: "api-key",
    secrets: { apiKey: "k-123" },
    oauthTokenUrl: null,
    writeEnabled: false,
    apiPath: null,
    timeoutMs: null,
    environment: "SANDBOX",
    client: null,
    ...over,
  };
}

describe("an api-key connection authenticates with its own header", () => {
  it("sends the key under `apikey` by default, and no Authorization at all", async () => {
    const headers = await buildAuthHeadersFromConnection(connection());
    expect(headers).toEqual({ [DEFAULT_API_KEY_HEADER]: "k-123" });
    expect(DEFAULT_API_KEY_HEADER).toBe("apikey");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("honours a custom header name for other API-key gateways", async () => {
    const headers = await buildAuthHeadersFromConnection(connection({ secrets: { apiKey: "k", apiKeyHeader: "X-Api-Key" } }));
    expect(headers).toEqual({ "X-Api-Key": "k" });
  });

  it("names the missing field rather than sending an empty header", async () => {
    await expect(buildAuthHeadersFromConnection(connection({ secrets: {} }))).rejects.toThrow(/missing apiKey/);
  });

  it("has no Authorization VALUE — the string builder refuses by design", async () => {
    await expect(buildAuthHeaderFromConnection(connection())).rejects.toThrow(/API-key header, not Authorization/);
  });

  it("the other four types still answer { Authorization } through the record builder", async () => {
    const basic = connection({ authType: "basic", secrets: { username: "u", password: "p" } });
    expect(await buildAuthHeadersFromConnection(basic)).toEqual({
      Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
    });
    const bearer = connection({ authType: "bearer", secrets: { bearerToken: "t" } });
    expect(await buildAuthHeadersFromConnection(bearer)).toEqual({ Authorization: "Bearer t" });
  });

  it("a tenant projected from the connection carries the header record", async () => {
    const tenant = toSapTenant(connection());
    expect(tenant.authHeaders).toBeTypeOf("function");
    await expect(tenant.authHeaders!()).resolves.toEqual({ apikey: "k-123" });
    // …and never serialises a secret.
    expect(JSON.stringify(tenant)).not.toContain("k-123");
  });
});

describe("the key survives sealing", () => {
  it("apiKey and apiKeyHeader round-trip through seal/open", () => {
    // openSecrets is an allow-list that has to track the type by hand; a
    // field it omits seals fine and is silently dropped on the way out.
    const opened = openSecrets(sealSecrets({ apiKey: "k-123", apiKeyHeader: "X-Api-Key" }));
    expect(opened).toEqual({ apiKey: "k-123", apiKeyHeader: "X-Api-Key" });
  });
});

describe("the route and the form know the type", () => {
  const ROOT = process.cwd();
  const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

  it("the connections route accepts api-key and requires the key", () => {
    const route = read("src/app/api/studio/connections/route.ts");
    expect(route).toMatch(/authType: z\.enum\(\[[^\]]*"api-key"/);
    expect(route).toMatch(/if \(v\.authType === "api-key"\) need\("apiKey"/);
    expect(route).toContain("apiKeyHeader: input.apiKeyHeader");
  });

  /*
   * The header name is operator-supplied, and "letters, digits and hyphens"
   * admits Authorization, Cookie and Host. The predicate is one module the
   * route, the form and the header builder all use — a security rule copied
   * into three files is a security rule that will disagree with itself.
   */
  it("the route and the form share the deny-list rather than each having a regex", () => {
    for (const file of [
      "src/app/api/studio/connections/route.ts",
      "src/components/studio/ConnectionsClient.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toContain("isAllowedApiKeyHeader");
      expect(src, file).not.toMatch(/regex\(\/\^\[A-Za-z0-9-\]\+\$\//);
    }
  });

  it("the form offers it, names SAP's sandbox, and defaults the header to apikey", () => {
    const ui = read("src/components/studio/ConnectionsClient.tsx");
    expect(ui).toMatch(/<option value="api-key">API key header — SAP Business Accelerator Hub sandbox<\/option>/);
    expect(ui).toContain('useState("apikey")');
    expect(ui).toMatch(/authType === "api-key" && !apiKey/);
  });

  it("every stored-connection request path spreads the header record", () => {
    for (const file of ["src/lib/northbound/read.ts", "src/lib/northbound/write.ts", "src/lib/studio/connection-health.ts"]) {
      const src = read(file);
      expect(src, file).toContain("buildAuthHeadersFromConnection(");
      expect(src, file).not.toContain("buildAuthHeaderFromConnection(");
    }
  });
});
