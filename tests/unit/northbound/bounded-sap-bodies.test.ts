// @vitest-environment node
/**
 * EVERY BODY FROM A BUILDER-NAMED HOST IS READ TO A BOUND (consolidated
 * containment review round 1).
 *
 * readEntitySet read the tenant's answer with `res.text()`: no byte cap, and
 * fetch inflates gzip before text() sees it. A builder with a free BTP trial
 * (any *.ondemand.com host passes the allow-list) could answer ~0.4 MB of gzip
 * that expands to hundreds of MB, through the Studio broker run or the
 * northbound data read, and two such reads at once exceed a 2 GB instance and
 * take every tenant's requests on it down. Each reader now stops at its bound
 * in DECODED bytes and cancels the stream (body-prefix.ts).
 */

import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FAILURE_REASON_INVALID_BODY } from "@/lib/northbound/failure-reason";
import { MAX_READ_BODY_BYTES, readEntitySet } from "@/lib/northbound/read";
import { MAX_WRITE_RESPONSE_BYTES, writeEntitySet } from "@/lib/northbound/write";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { fetchHarvestRows, MAX_HARVEST_FILE_BYTES } from "@/lib/sap-public/hub-harvest-remote";

function conn(baseUrl: string, overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection {
  return {
    source: "db",
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "trial",
    label: "A BTP trial",
    baseUrl,
    authType: "basic",
    secrets: { username: "u", password: "p" },
    oauthTokenUrl: null,
    writeEnabled: true,
    apiPath: null,
    timeoutMs: null,
    environment: "SANDBOX",
    client: null,
    ...overrides,
  };
}

/** A body that never ends, and whether the reader cancelled it. */
function endless(chunk: string): { stream: ReadableStream<Uint8Array>; state: { pulled: number; cancelled: boolean } } {
  const state = { pulled: 0, cancelled: false };
  const bytes = new TextEncoder().encode(chunk);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulled += 1;
      controller.enqueue(bytes);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

describe("readEntitySet against a gzip bomb served by a real HTTP server", () => {
  // 256 MiB of valid OData once inflated; about 256 KB on the wire.
  const INFLATED = 256 * 1024 * 1024;
  const json = Buffer.concat([Buffer.from('{"d":{"results":['), Buffer.alloc(INFLATED, " "), Buffer.from("]}}")]);
  const bomb = gzipSync(json, { level: 9 });
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
      res.end(bomb);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it("is refused as an invalid body past its bound, the stream cancelled, never parsed", async () => {
    expect(bomb.length).toBeLessThan(512 * 1024);
    const r = await readEntitySet({ connection: conn(baseUrl), servicePath: "/sap/opu/odata/sap/ZBOMB_SRV", entitySet: "Rows", limit: 100 });
    expect(r.status).toBe("ERROR");
    expect(r.failureReason).toBe(FAILURE_REASON_INVALID_BODY);
    expect(r.records).toEqual([]);
    expect(r.detail).toMatch(/larger than .* MB, so it was not read/);
    // It stopped near its bound: well short of the 256 MiB the body inflates to.
    // Read whole, the same body parsed as an EMPTY read of 256 MiB.
    expect(MAX_READ_BODY_BYTES).toBeLessThan(INFLATED / 8);
  });

  it("a real answer under the bound still reads", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ ID: String(i), Name: "x".repeat(2000) }));
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ d: { results: rows } }), { status: 200 }));
    const r = await readEntitySet({ connection: conn("https://my1234-api.s4hana.cloud.sap"), servicePath: "/sap/opu/odata/sap/API_X", entitySet: "A_X", limit: 100 }, f);
    expect(r.status).toBe("OK");
    expect(r.records).toHaveLength(100);
  });
});

describe("the other readers of a body a builder or a remote host chooses", () => {
  it("a write's answer past its bound is not parsed, and the stream is cancelled", async () => {
    const handshake = new Response("", { headers: { "x-csrf-token": "t" } });
    const { stream, state } = endless('{"d":{"ID":"1","Pad":"' + "a".repeat(64 * 1024));
    // A 200, not a 201: a 201 past the bound stays CREATED (wide-sap-answers.test.ts).
    const f = vi.fn().mockResolvedValueOnce(handshake).mockResolvedValueOnce(new Response(stream, { status: 200 }));
    const r = await writeEntitySet(
      { connection: conn("https://my1234-api.s4hana.cloud.sap"), servicePath: "/sap/odata/API_TEST", entitySet: "A_Thing", payload: { Name: "x" } },
      f as unknown as typeof fetch,
    );
    expect(r.status).toBe("ERROR");
    expect(r.failureReason).toBe(FAILURE_REASON_INVALID_BODY);
    expect(state.cancelled).toBe(true);
    expect(state.pulled * 64 * 1024).toBeLessThan(MAX_WRITE_RESPONSE_BYTES + 256 * 1024);
  });

  it("a harvest file past its bound is refused, and the stream is cancelled", async () => {
    const { stream, state } = endless("[" + '{"a":1},'.repeat(64 * 1024));
    const f = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    const r = await fetchHarvestRows("https://raw.githubusercontent.com/o/r/sha/x.json", f as unknown as typeof fetch);
    expect(r).toEqual({ error: expect.stringMatching(/larger than 32 MB/) as unknown as string });
    expect(state.cancelled).toBe(true);
    expect(state.pulled * 512 * 1024).toBeLessThan(MAX_HARVEST_FILE_BYTES + 1024 * 1024);
  });
});
