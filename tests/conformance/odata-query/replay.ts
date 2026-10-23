/**
 * The conformance suite's SAP (P1.4, tier 1): a strict-replay HTTP server on
 * 127.0.0.1, with real sockets, gzip and chunked bodies.
 *
 * STRICT. It answers only the exchange a case recorded next, and only when the
 * request is that exchange exactly: the method, the decoded path, the decoded
 * query parameters in order, and the Accept and OData-MaxVersion headers. Any
 * other request is answered 599 and recorded as a mismatch, with a diff
 * against the recording it was expected to be, so a change in what CoreEdge
 * sends fails the case that pins it, field by field.
 *
 * It imports nothing from src/: what it compares is the request as it
 * arrived on the socket.
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

export interface RecordedRequest {
  readonly method: "GET";
  /** The decoded path, from the service root on. */
  readonly path: string;
  /** The decoded query parameters, in the order they must arrive. */
  readonly query: readonly (readonly [string, string])[];
  readonly accept: string;
  /** "4.0" on V4, null on V2. */
  readonly maxVersion: string | null;
}

export interface RecordedAnswer {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** JSON, or text as it is. */
  readonly body: unknown;
  readonly gzip?: boolean;
  readonly chunked?: boolean;
}

export interface Exchange {
  readonly request: RecordedRequest;
  readonly answer: RecordedAnswer;
}

export interface Received {
  /** The request target as it arrived on the socket: path and query, still encoded. */
  readonly target: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

function decode(s: string): string {
  return decodeURIComponent(s);
}

function asRecorded(req: IncomingMessage): RecordedRequest {
  const target = req.url ?? "/";
  const q = target.indexOf("?");
  const rawPath = q === -1 ? target : target.slice(0, q);
  const rawQuery = q === -1 ? "" : target.slice(q + 1);
  const query = rawQuery === "" ? [] : rawQuery.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    return [decode(pair.slice(0, eq)), decode(pair.slice(eq + 1))] as const;
  });
  const maxVersion = req.headers["odata-maxversion"];
  return {
    method: (req.method ?? "") as "GET",
    path: decode(rawPath),
    query,
    accept: String(req.headers.accept ?? ""),
    maxVersion: typeof maxVersion === "string" ? maxVersion : null,
  };
}

/** Field by field: what arrived against what was recorded. */
export function diffRequests(got: RecordedRequest, want: RecordedRequest): string[] {
  const out: string[] = [];
  if (got.method !== want.method) out.push(`method: got ${got.method}, want ${want.method}`);
  if (got.path !== want.path) out.push(`path: got ${got.path}, want ${want.path}`);
  if (got.accept !== want.accept) out.push(`Accept: got ${got.accept}, want ${want.accept}`);
  if (got.maxVersion !== want.maxVersion) out.push(`OData-MaxVersion: got ${got.maxVersion}, want ${want.maxVersion}`);
  const n = Math.max(got.query.length, want.query.length);
  for (let i = 0; i < n; i++) {
    const g = got.query[i];
    const w = want.query[i];
    if (g?.[0] !== w?.[0] || g?.[1] !== w?.[1]) out.push(`query[${i}]: got ${JSON.stringify(g ?? null)}, want ${JSON.stringify(w ?? null)}`);
  }
  return out;
}

export interface Replay {
  readonly origin: string;
  /** Load the exchanges the next call must make, in order. */
  expect(exchanges: readonly Exchange[]): void;
  /** What arrived since the last expect(), and what did not match. */
  readonly received: Received[];
  readonly mismatches: string[];
  /** Exchanges recorded but never asked for. */
  pending(): number;
  close(): Promise<void>;
}

export async function startReplay(): Promise<Replay> {
  let queue: Exchange[] = [];
  const received: Received[] = [];
  const mismatches: string[] = [];
  const server: Server = createServer((req, res) => {
    received.push({ target: req.url ?? "", method: req.method ?? "", headers: { ...req.headers } });
    const got = asRecorded(req);
    const next = queue[0];
    const diff = next ? diffRequests(got, next.request) : ["no exchange was recorded for this request"];
    if (!next || diff.length > 0) {
      mismatches.push(`${got.method} ${req.url}\n  ${diff.join("\n  ")}`);
      res.writeHead(599, { "content-type": "text/plain" });
      res.end("unrecorded");
      return;
    }
    queue.shift();
    const { answer } = next;
    const text = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    let payload: Buffer = Buffer.from(text, "utf8");
    const headers: Record<string, string> = { "content-type": "application/json", ...(answer.headers ?? {}) };
    if (answer.gzip) {
      payload = gzipSync(payload);
      headers["content-encoding"] = "gzip";
    }
    if (!answer.chunked) headers["content-length"] = String(payload.length);
    res.writeHead(answer.status, headers);
    if (!answer.chunked) {
      res.end(payload);
      return;
    }
    // Three chunks, each its own write and its own tick.
    const third = Math.ceil(payload.length / 3);
    const parts = [payload.subarray(0, third), payload.subarray(third, 2 * third), payload.subarray(2 * third)];
    const writeNext = () => {
      const part = parts.shift();
      if (part === undefined) {
        res.end();
        return;
      }
      res.write(part);
      setImmediate(writeNext);
    };
    writeNext();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    expect(exchanges) {
      queue = [...exchanges];
      received.length = 0;
      mismatches.length = 0;
    },
    received,
    mismatches,
    pending: () => queue.length,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
