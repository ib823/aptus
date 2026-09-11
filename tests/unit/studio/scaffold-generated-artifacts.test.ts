/**
 * Three things the generated kit got wrong, each only visible on the
 * developer's machine rather than in the product that generated it.
 *
 *  1. A field a consultant types — `externalId`, `entitySet` — was interpolated
 *     RAW into two documents that have syntax of their own: a TypeScript block
 *     comment and a markdown code span. `safeName` covered the HTML-ish sinks
 *     and nothing covered these, so a comment terminator inside a service name
 *     ends client.ts's header and the rest of the line becomes code.
 *
 *  2. The generated client called `res.json()` BEFORE looking at `res.ok`. A
 *     proxy 502 and an edge 429 are usually HTML, so the parse threw a
 *     SyntaxError and the developer lost the status and the correlation id at
 *     exactly the moment they needed them.
 *
 *  3. The mock ignored `?limit=` entirely and served the whole fixture, so
 *     `read(1)` came back with every recorded row — code written against the
 *     mock broke on the first real call, which is the one failure an offline
 *     mock exists to prevent.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  buildDemo,
  buildMockServer,
  buildReadme,
  buildTypeScriptClient,
  type ScaffoldInterface,
} from "@/lib/studio/scaffold";

const IFACE: ScaffoldInterface = {
  id: "if_po",
  name: "Purchase Order",
  externalId: "CE_PURCHASEORDER_0001",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "PurchaseOrder",
  version: 3,
  solutionName: "QA-E2E-Main",
};

/** The same record, named by someone who used the characters these files use. */
const HOSTILE: ScaffoldInterface = {
  ...IFACE,
  externalId: "CE_PO_*/ evil()",
  entitySet: "Purchase`Order",
};

function nodeCheck(source: string, filename: string): void {
  const dir = mkdtempSync(join(tmpdir(), "coreedge-scaffold-"));
  try {
    const file = join(dir, filename);
    writeFileSync(file, source, "utf8");
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("a service name cannot break out of the document it is written into", () => {
  it("client.ts's header comment survives a comment terminator in the externalId", () => {
    const src = buildTypeScriptClient(HOSTILE);
    const header = src.slice(0, src.indexOf("*/") + 2);
    // The header ends where the generator ends it, not where the data does.
    expect(header).toContain("openapi-generator-cli");
    // The characters are still readable — this escapes, it does not reject.
    expect(header).toContain("CE_PO_*");
    expect(header).toContain("evil()");
  });

  it("the README's code span survives a backtick in the entity set", () => {
    const readme = buildReadme(HOSTILE);
    const interfaceSection = readme.slice(readme.indexOf("## Interface"));
    // Fenced by markdown's own rule — a longer run than anything inside — so
    // the value travels whole rather than being substituted or stripped.
    // Padded, which is markdown's rule for a span whose content touches a
    // backtick; the render strips the padding again.
    expect(interfaceSection).toContain("`` Purchase`Order ``");
    expect(interfaceSection).toContain("CE_PO_*/ evil()");
  });

  it("an ordinary record is untouched — no fence, no escape, no noise", () => {
    const readme = buildReadme(IFACE);
    expect(readme).toContain("- Service: `CE_PURCHASEORDER_0001` (s4hana)");
    expect(readme).toContain("- Entity set: `PurchaseOrder`");
    expect(buildTypeScriptClient(IFACE)).toContain("(CE_PURCHASEORDER_0001, v3)");
  });
});

describe("the generated client reads the status before it trusts the body", () => {
  const src = buildTypeScriptClient(IFACE);

  it("takes the body as text and parses it defensively", () => {
    expect(src).toContain("await res.text()");
    // The old shape: a bare res.json() whose throw pre-empted every check.
    expect(src).not.toContain("(await res.json())");
  });

  it("throws a CoreEdgeError carrying the status even when the body is not JSON", () => {
    expect(src).toContain("Request failed with HTTP ");
    expect(src).toContain('json?.error?.correlationId ?? res.headers.get("x-correlation-id")');
  });

  it("demo.mjs does the same, and is still parseable", () => {
    const demo = buildDemo(IFACE);
    expect(demo).toContain("await res.text()");
    expect(demo).not.toContain("const json = await res.json();");
    expect(() => nodeCheck(demo, "demo.mjs")).not.toThrow();
  });
});

/*
 * The mock, RUN — not inspected. A generated server is an artifact that has to
 * work on someone else's machine, and the only evidence of that is starting it
 * and making the request the client will make.
 */
describe("the mock honours ?limit, as the broker does", () => {
  const dirs: string[] = [];
  const servers: ReturnType<typeof spawn>[] = [];

  afterAll(() => {
    for (const s of servers) s.kill("SIGKILL");
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  async function freePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
      const srv = createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const port = (srv.address() as { port: number }).port;
        srv.close(() => resolve(port));
      });
    });
  }

  async function startMock(): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), "coreedge-mock-"));
    dirs.push(dir);
    writeFileSync(join(dir, "mock.mjs"), buildMockServer(IFACE), "utf8");
    writeFileSync(
      join(dir, "fixtures.json"),
      JSON.stringify({
        fixtures: [
          {
            scenario: "data",
            status: 200,
            body: {
              records: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }],
              count: 5,
              empty: false,
              note: "5 records.",
            },
          },
        ],
      }),
      "utf8",
    );

    const port = await freePort();
    const child = spawn(process.execPath, ["mock.mjs"], {
      cwd: dir,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    servers.push(child);
    const base = `http://127.0.0.1:${port}`;
    // Wait for the listener rather than sleeping a guessed interval.
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        await fetch(`${base}/interfaces/${IFACE.id}/data`, { headers: { Authorization: "Bearer x" } });
        return base;
      } catch (err) {
        if (Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  async function read(base: string, query: string) {
    const res = await fetch(`${base}/interfaces/${IFACE.id}/data${query}`, {
      headers: { Authorization: "Bearer anything" },
    });
    return (await res.json()) as {
      data: { records: unknown[]; count: number; empty: boolean; note: string };
    };
  }

  it("serves exactly the rows asked for, with count and empty recomputed", async () => {
    const base = await startMock();

    const one = await read(base, "?limit=1");
    expect(one.data.records).toHaveLength(1);
    expect(one.data.count).toBe(1);
    expect(one.data.empty).toBe(false);
    // The note stops claiming five rows it is not serving.
    expect(one.data.note).toMatch(/truncated 5 recorded rows to \?limit=1/);

    const all = await read(base, "?limit=50");
    expect(all.data.records).toHaveLength(5);
    expect(all.data.note).toBe("5 records.");

    // No limit is the broker's default of 10, which this fixture is under.
    const none = await read(base, "");
    expect(none.data.records).toHaveLength(5);

    // Out of range is clamped, not rejected — the broker's own bounds.
    expect((await read(base, "?limit=0")).data.records).toHaveLength(1);
    expect((await read(base, "?limit=nonsense")).data.records).toHaveLength(5);
  }, 30_000);
});
