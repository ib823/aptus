// @vitest-environment node
/**
 * A HEALTHY SAP ANSWER IS NEVER CUT INTO SAP'S FAILURE (P1 on wave 2
 * integration review round 1).
 *
 * The decoded-byte bounds on SAP bodies (bounded-sap-bodies.test.ts) were
 * 3.125 MiB for a read and 1 MiB for a write's answer. Wide rows (a
 * SuccessFactors Photo or Attachment; the broker sends no $select) pass the
 * first at a high limit, and a 201 echoing a base64 upload passes the second.
 * Both answers were served before the bounds. Cut at them, the read was an
 * ERROR on HTTP 200 that the breaker counted as an upstream error and the
 * consumer saw as a 502; the 201 was an ambiguous ERROR stored under the
 * Idempotency-Key although SAP had created the record. (The rotation probe
 * read a data row too; since the wave 2 redesign it reads only `$metadata`.)
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { circuitOutcomeForRead } from "@/lib/governed/pipeline";
import { FAILURE_REASON_INVALID_BODY } from "@/lib/northbound/failure-reason";
import { httpStatusFor, MAX_READ_BODY_BYTES, readEntitySet } from "@/lib/northbound/read";
import { MAX_WRITE_RESPONSE_BYTES, writeEntitySet } from "@/lib/northbound/write";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { probeRotation } from "@/lib/sap-public/rotation-probe";

const BASE = "https://my000001-api.s4hana.cloud.sap";
const SERVICE = "/sap/opu/odata/sap/API_X";

const conn = (overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection => ({
  source: "db",
  id: "conn_1",
  organizationId: "org_a",
  product: "s4hana",
  key: "dev",
  label: "DEV",
  baseUrl: BASE,
  authType: "basic",
  secrets: { username: "COMM_USER", password: "new" },
  oauthTokenUrl: null,
  writeEnabled: true,
  apiPath: SERVICE,
  timeoutMs: null,
  environment: "DEV",
  client: null,
  ...overrides,
});

/** One photo row of about 3.5 MB: over the old 3.125 MiB bound. */
const PHOTO = JSON.stringify({ d: { results: [{ userId: "u1", photo: "A".repeat(3_500_000) }] } });
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

describe("a wide read SAP answered", () => {
  it("is OK at limit 1, served 200, and counted by the breaker as ok", async () => {
    const f = vi.fn().mockResolvedValue(new Response(PHOTO, { status: 200, headers: { "content-type": "application/json" } }));
    const r = await readEntitySet({ connection: conn(), servicePath: SERVICE, entitySet: "Photo", limit: 1 }, f as unknown as typeof fetch);
    expect(r.status).toBe("OK");
    expect(r.failureReason).toBeNull();
    expect(r.records).toHaveLength(1);
    expect(httpStatusFor(r.status)).toBe(200);
    expect(circuitOutcomeForRead(r.status)).toBe("ok");
  });

  it("cannot reach the rotation probe, which reads only $metadata", async () => {
    const sap = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("$metadata")
        ? new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } })
        : new Response(PHOTO, { status: 200, headers: { "content-type": "application/json" } }),
    );
    const probe = await probeRotation(conn(), SERVICE, sap as unknown as typeof fetch);
    expect(probe.answer).toEqual({ ran: true, outcome: "passed", reason: "metadata_ok" });
    expect(sap.mock.calls.every(([url]) => String(url).includes("$metadata"))).toBe(true);
  });

  it("the bound sits above anything a Vercel function can return (~4.5 MB)", () => {
    expect(MAX_READ_BODY_BYTES).toBeGreaterThanOrEqual(16 * 1024 * 1024);
    expect(MAX_WRITE_RESPONSE_BYTES).toBeGreaterThanOrEqual(16 * 1024 * 1024);
  });
});

function handshakeThen(answer: Response): typeof fetch {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response("", { headers: { "x-csrf-token": "t" } }))
    .mockResolvedValueOnce(answer) as unknown as typeof fetch;
}

/** A body that never ends; the reader must cancel it. */
function endless(chunk: string): { stream: ReadableStream<Uint8Array>; state: { cancelled: boolean } } {
  const state = { cancelled: false };
  const bytes = new TextEncoder().encode(chunk);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(bytes);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

describe("a write SAP created", () => {
  const LOCATION = `${BASE}${SERVICE}/A_Upload('42')`;
  const input = { connection: conn(), servicePath: SERVICE, entitySet: "A_Upload", payload: { Name: "x" } };

  it("is CREATED with its record when the 201 echoes a 1.5 MB upload", async () => {
    const echo = JSON.stringify({ d: { ID: "42", Content: "A".repeat(1_500_000) } });
    const r = await writeEntitySet(input, handshakeThen(new Response(echo, { status: 201, headers: { location: LOCATION } })));
    expect(r.status).toBe("CREATED");
    expect(r.failureReason).toBeNull();
    expect(r.record).toMatchObject({ ID: "42" });
    expect(r.location).toBe("/A_Upload('42')");
  });

  it("stays CREATED, with no record and its Location, when the 201's body passes the bound", async () => {
    const { stream, state } = endless('{"d":{"ID":"42","Content":"' + "a".repeat(64 * 1024));
    const r = await writeEntitySet(input, handshakeThen(new Response(stream, { status: 201, headers: { location: LOCATION } })));
    expect(state.cancelled).toBe(true);
    expect(r.status).toBe("CREATED");
    expect(r.record).toBeNull();
    expect(r.location).toBe("/A_Upload('42')");
    expect(r.detail).toBe("The record was created.");
  });

  it("a 200 past the bound proves nothing and stays an invalid write response", async () => {
    const { stream } = endless('{"d":{"ID":"42","Content":"' + "a".repeat(64 * 1024));
    const r = await writeEntitySet(input, handshakeThen(new Response(stream, { status: 200 })));
    expect(r.status).toBe("ERROR");
    expect(r.failureReason).toBe(FAILURE_REASON_INVALID_BODY);
    expect(r.attempted).toBe(true);
  });
});
