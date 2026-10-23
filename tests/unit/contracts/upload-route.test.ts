// @vitest-environment node
/**
 * POST /api/studio/interfaces/from-description (P1.2, acceptance A2), with the
 * Contract Compiler's envelope stood in for: the record job runs in process
 * (jobs.ts is pure), so the route's own gates and answers are what is tested
 * here. tests/integration/contract-upload.test.ts runs the real worker and the
 * real database.
 *
 *   - 413 by the declared size and by the stream, before any parse;
 *   - exactly one file part and one fields part;
 *   - strict UTF-8;
 *   - the compiler's admission (DISABLED, ALLOWANCE) refuses before the body
 *     is read at all; BUSY and RESOURCE_LIMIT are answered as themselves;
 *   - NO_SUCH_ENTITY_SET names the datasets; a version that disagrees is refused;
 *   - a `custom:` id is refused, with the same sentence as the registration;
 *   - another organisation's solution is a 404;
 *   - and on success: one transaction, the snapshot's origin UPLOAD with no
 *     environment or connection, the audit row in the transaction, and no
 *     request to anywhere.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runJob, type Job } from "@/lib/contracts/jobs";

const ROOT = path.resolve(__dirname, "../../..");
const golden = (name: string) => readFileSync(path.join(ROOT, "tests/fixtures/contracts/edmx", name), "utf8");

const { mocks, db } = vi.hoisted(() => ({
  mocks: {
    user: vi.fn(),
    admission: vi.fn(),
    runJob: vi.fn(),
    rate: vi.fn(),
    version: vi.fn(),
    journey: vi.fn(),
  },
  db: {
    solutions: [] as { id: string; organizationId: string }[],
    tx: [] as { op: string; args: unknown }[],
    transactions: 0,
  },
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/contracts/envelope", () => ({ contractJobAdmission: mocks.admission, runContractJob: mocks.runJob }));
vi.mock("@/lib/security/rate-limit", async (orig) => ({ ...(await orig<object>()), checkRateLimit: mocks.rate }));
vi.mock("@/lib/contracts/record", () => ({ serviceODataVersion: mocks.version }));
vi.mock("@/lib/coreedge/journey", () => ({ recordJourneyEvent: mocks.journey }));
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    interface: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.tx.push({ op: "interface.create", args });
        return { id: "if_1", version: 1, servicePath: null, odataVersion: null, ...args.data };
      }),
      updateMany: vi.fn(async (args: unknown) => {
        db.tx.push({ op: "interface.updateMany", args });
        return { count: 1 };
      }),
    },
    contractSnapshot: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.tx.push({ op: "contractSnapshot.create", args });
        return { id: "snap_1", createdAt: new Date(), ...args.data };
      }),
    },
    configAudit: {
      create: vi.fn(async (args: unknown) => {
        db.tx.push({ op: "configAudit.create", args });
        return {};
      }),
    },
    $executeRaw: vi.fn(async () => {
      db.tx.push({ op: "$executeRaw", args: null });
      return 1;
    }),
  };
  return {
    prisma: {
      solution: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
          db.solutions.find((s) => s.id === where.id && s.organizationId === where.organizationId) ?? null,
        ),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        db.transactions += 1;
        return fn(tx);
      }),
    },
  };
});

const { POST } = await import("@/app/api/studio/interfaces/from-description/route");
const register = await import("@/app/api/studio/interfaces/route");

const BUILDER = { id: "u_1", role: "consultant", organizationId: "org_a", email: "b@x.test" };
const FIELDS = { solutionId: "sol_a", sapProduct: "s4hana", name: "Sales bonus", operation: "READ", servicePath: "/sap/opu/odata/sap/YY1_SALESBONUS_CDS", odataVersion: "V2" };

function form(parts: Record<string, string | Blob>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(parts)) f.append(k, v);
  return f;
}

function request(body: FormData | string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/studio/interfaces/from-description", { method: "POST", body, headers });
}

function upload(fields: Record<string, unknown>, description: string | Uint8Array<ArrayBuffer> = golden("yy1-sales-bonus.v2.xml")): NextRequest {
  return request(form({ description: new Blob([description], { type: "application/xml" }), fields: JSON.stringify(fields) }));
}

/** The entity set the YY1 golden file declares. */
function yy1EntitySet(): string {
  return /EntitySet Name="([^"]+)"/.exec(golden("yy1-sales-bonus.v2.xml"))![1]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.solutions = [{ id: "sol_a", organizationId: "org_a" }, { id: "sol_b", organizationId: "org_b" }];
  db.tx = [];
  db.transactions = 0;
  mocks.user.mockResolvedValue(BUILDER);
  mocks.rate.mockResolvedValue({ allowed: true, resetMs: 0, remaining: 10 });
  mocks.admission.mockResolvedValue(null);
  mocks.version.mockResolvedValue("V2");
  // The envelope, in process: the job's load, then the pure job itself.
  mocks.runJob.mockImplementation(async (_kind: string, load: () => Promise<Job | null>) => {
    const job = await load();
    return job ? { ok: true, value: runJob(job), ms: 1 } : null;
  });
  vi.stubGlobal("fetch", () => {
    throw new Error("an upload must not send a request");
  });
});

describe("the upload's size", () => {
  it("is refused by its declared length before anything is read", async () => {
    const req = request("x", { "content-type": "multipart/form-data; boundary=b", "content-length": String(5 * 1024 * 1024) });
    let read = false;
    const body = req.body;
    Object.defineProperty(req, "body", { get: () => ((read = true), body) });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(read).toBe(false);
    expect(mocks.admission).not.toHaveBeenCalled();
  });

  it("is refused by the stream when the length is not declared", async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 70 * 1024).fill(0x20);
    const res = await POST(request(big, { "content-type": "multipart/form-data; boundary=b" }));
    expect(res.status).toBe(413);
    expect(mocks.runJob).not.toHaveBeenCalled();
  });

  it("is refused as a file part past 4 MiB, with the way forward", async () => {
    const res = await POST(upload({ ...FIELDS, entitySet: "X" }, new Uint8Array(4 * 1024 * 1024 + 1).fill(0x20)));
    expect(res.status).toBe(413);
    expect((await res.json()).error.message).toMatch(/verify it from the tenant/);
  });
});

describe("the form", () => {
  it("needs exactly the description file and the fields", async () => {
    const extra = form({ description: new Blob(["<x/>"]), fields: JSON.stringify(FIELDS), other: "x" });
    expect((await POST(request(extra))).status).toBe(400);
    expect((await POST(request(form({ description: new Blob(["<x/>"]) })))).status).toBe(400);
    const two = form({ description: new Blob(["<x/>"]), fields: JSON.stringify(FIELDS) });
    two.append("description", new Blob(["<y/>"]));
    expect((await POST(request(two))).status).toBe(400);
    expect((await POST(request(form({ description: "not a file", fields: JSON.stringify(FIELDS) })))).status).toBe(400);
  });

  it("refuses a description that is not UTF-8", async () => {
    const res = await POST(upload({ ...FIELDS, entitySet: "X" }, new Uint8Array([0x3c, 0x78, 0xff, 0xfe, 0x3e])));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/Save the description as UTF-8/);
  });

  it("needs the dataset", async () => {
    expect((await POST(upload(FIELDS))).status).toBe(400);
  });

  it("refuses a custom: id with the registration's own sentence", async () => {
    const fields = { solutionId: "sol_a", sapProduct: "s4hana", name: "x", externalId: "custom:/sap/opu/odata/sap/zx" };
    const res = await POST(upload({ ...fields, entitySet: "X" }));
    const reg = await register.POST(new NextRequest("http://localhost/api/studio/interfaces", { method: "POST", body: JSON.stringify(fields) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe((await reg.json()).error.message);
  });

  it("answers an OData version without a path as the registration does", async () => {
    const fields = { solutionId: "sol_a", sapProduct: "s4hana", name: "x", externalId: "API_X", odataVersion: "V2" };
    const res = await POST(upload({ ...fields, entitySet: "X" }));
    const reg = await register.POST(new NextRequest("http://localhost/api/studio/interfaces", { method: "POST", body: JSON.stringify(fields) }));
    expect((await res.json()).error.message).toBe((await reg.json()).error.message);
  });

  it("is a 404 for another organization's solution, and creates nothing", async () => {
    const res = await POST(upload({ ...FIELDS, solutionId: "sol_b", entitySet: yy1EntitySet() }));
    expect(res.status).toBe(404);
    expect(db.transactions).toBe(0);
  });
});

describe("the compiler", () => {
  it.each([
    ["DISABLED", 503],
    ["ALLOWANCE", 429],
  ] as const)("refused at admission (%s) reads no body", async (reason, status) => {
    mocks.admission.mockResolvedValue({ ok: false, reason, detail: "Spent.", ms: 0, ...(reason === "ALLOWANCE" ? { retryAfterMs: 3_600_000 } : {}) });
    const req = upload({ ...FIELDS, entitySet: yy1EntitySet() });
    let read = false;
    const body = req.body;
    Object.defineProperty(req, "body", { get: () => ((read = true), body) });
    const res = await POST(req);
    expect(res.status).toBe(status);
    expect(read).toBe(false);
    if (reason === "ALLOWANCE") expect(res.headers.get("retry-after")).toBe("3600");
  });

  it("busy is a 503 to retry in seconds; past its limits is a 422", async () => {
    mocks.runJob.mockResolvedValueOnce({ ok: false, reason: "BUSY", detail: "busy", ms: 1 });
    const busy = await POST(upload({ ...FIELDS, entitySet: yy1EntitySet() }));
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("5");
    mocks.runJob.mockResolvedValueOnce({ ok: false, reason: "RESOURCE_LIMIT", detail: "limit", ms: 1 });
    const big = await POST(upload({ ...FIELDS, entitySet: yy1EntitySet() }));
    expect(big.status).toBe(422);
    expect((await big.json()).error.message).toMatch(/too large or too complex/);
    expect(db.transactions).toBe(0);
  });

  it("a description it refuses is a 422 with its sentence", async () => {
    const res = await POST(upload({ ...FIELDS, entitySet: "X" }, '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><x/>'));
    expect(res.status).toBe(422);
    expect(db.transactions).toBe(0);
  });

  it("names the datasets when the dataset is not among them", async () => {
    const res = await POST(upload({ ...FIELDS, entitySet: "NoSuchSet" }));
    expect(res.status).toBe(422);
    const message = (await res.json()).error.message as string;
    expect(message).toContain("NoSuchSet");
    expect(message).toContain(yy1EntitySet());
    expect(db.transactions).toBe(0);
  });

  it("refuses a description of another OData version than the service's", async () => {
    const res = await POST(upload({ ...FIELDS, odataVersion: "V4", servicePath: "/sap/opu/odata4/sap/yy1_x/srvd/sap/yy1_x/0001", entitySet: yy1EntitySet() }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/OData V2/);
  });
});

describe("a description that compiles", () => {
  it("creates the DRAFT and its first contract in one transaction, from no tenant", async () => {
    const res = await POST(upload({ ...FIELDS, entitySet: yy1EntitySet() }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.interface).toMatchObject({ status: "DRAFT", externalId: "custom:/sap/opu/odata/sap/yy1_salesbonus_cds" });
    expect(body.data.contract).toMatchObject({ status: "RECORDED", semver: "1.0.0", describedBy: "upload" });
    expect(body.data.verified).toBe(false);
    expect(db.transactions).toBe(1);
    const ops = db.tx.map((t) => t.op);
    expect(ops[0]).toBe("interface.create");
    expect(ops).toContain("contractSnapshot.create");
    expect(ops.at(-1)).toBe("configAudit.create");
    const snap = db.tx.find((t) => t.op === "contractSnapshot.create")!.args as { data: Record<string, unknown> };
    expect(snap.data).toMatchObject({ origin: "UPLOAD", environment: null, connectionId: null, semver: "1.0.0", source: "METADATA" });
    const audit = db.tx.find((t) => t.op === "configAudit.create")!.args as { data: { action: string; after: { upload: { sha256: string; bytes: number } } } };
    expect(audit.data.action).toBe("CREATE");
    expect(audit.data.after.upload.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Neither the file name nor the description is stored.
    expect(JSON.stringify(db.tx)).not.toContain("<edmx");
    expect(mocks.journey).toHaveBeenCalledOnce();
  });
});
