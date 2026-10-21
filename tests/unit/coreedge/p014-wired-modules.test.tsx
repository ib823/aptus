/**
 * P0.14 wires the modules that were built and imported nowhere:
 * correlation-lookup.ts (a correlation-id search box in Operations),
 * service-health.ts (the verdict and its owner on the SAP system screen), and
 * the circuit breaker's refusal as the lookup reads it back.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { northboundAuditEvent: { findFirst } } }));

import { CorrelationSearch } from "@/app/(coreedge)/coreedge/operations/CorrelationSearch";
import { lookupCorrelationId } from "@/lib/coreedge/correlation-lookup";
import { ownerForService, serviceHealthFactsOf, verdictForService } from "@/lib/coreedge/service-health";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("the four modules are imported where the roadmap says", () => {
  it("each has a caller outside its tests", () => {
    expect(read("src/app/(coreedge)/coreedge/operations/page.tsx")).toContain("lookupCorrelationId(");
    expect(read("src/app/(coreedge)/coreedge/sap-systems/[id]/page.tsx")).toMatch(/verdictForService\(|ownerForService\(/);
    expect(read("src/lib/governed/containment.ts")).toContain('from "@/lib/northbound/circuit-breaker"');
    expect(read("src/app/api/studio/connections/route.ts")).toContain('from "@/lib/sap-public/rotation"');
  });
});

describe("the correlation-id search in Operations", () => {
  it("is a plain GET form on the Operations page", () => {
    render(<CorrelationSearch query="" outcome={null} />);
    const box = screen.getByRole("searchbox", { name: "Correlation id" });
    expect(box.closest("form")?.getAttribute("method")).toBe("get");
    expect(box.closest("form")?.getAttribute("action")).toBe("/coreedge/operations");
    expect(box.getAttribute("name")).toBe("correlationId");
  });

  it("shows what the call reached, never a payload", async () => {
    findFirst.mockResolvedValue({
      correlationId: "corr_1",
      at: new Date("2026-10-20T11:00:00.000Z"),
      status: 503,
      operation: "READ",
      externalId: "purchase-orders",
      environment: "PROD",
      rowCount: null,
      durationMs: null,
      dryRun: false,
      bindingRefusal: null,
      failureReason: "CIRCUIT_OPEN",
    });
    const outcome = await lookupCorrelationId("org_a", "corr_1", NOW);
    render(<CorrelationSearch query="corr_1" outcome={outcome} />);
    expect(screen.getByText(/circuit breaker refused the call\. Nothing was sent to SAP/)).toBeTruthy();
    expect(screen.getByText("the SAP connection")).toBeTruthy();
    expect(screen.getByText("Not sent to SAP")).toBeTruthy();
    // Scoped by construction: the organization leads the query.
    expect(findFirst.mock.calls.at(-1)![0].where).toEqual({ organizationId: "org_a", correlationId: "corr_1" });
  });

  it("shows a grant refusal as the access grant's, not SAP's answer", async () => {
    findFirst.mockResolvedValue({
      correlationId: "corr_2",
      at: new Date("2026-10-20T11:00:00.000Z"),
      status: 403,
      operation: "READ",
      externalId: "-",
      environment: "PROD",
      rowCount: null,
      durationMs: null,
      dryRun: false,
      bindingRefusal: null,
      failureReason: null,
      connectionId: null,
      replayed: false,
    });
    const outcome = await lookupCorrelationId("org_a", "corr_2", NOW);
    render(<CorrelationSearch query="corr_2" outcome={outcome} />);
    expect(screen.getByText("the access grant")).toBeTruthy();
    expect(screen.queryByText("SAP's answer to the read")).toBeNull();
    expect(screen.getByText(/Nothing was sent to SAP/)).toBeTruthy();
  });

  it("shows a refused request as the request's", async () => {
    findFirst.mockResolvedValue({
      correlationId: "corr_3",
      at: new Date("2026-10-20T11:00:00.000Z"),
      status: 409,
      operation: "WRITE",
      externalId: "supplier-invoices",
      environment: "PROD",
      rowCount: null,
      durationMs: null,
      dryRun: false,
      bindingRefusal: null,
      failureReason: null,
      connectionId: null,
      replayed: false,
    });
    const outcome = await lookupCorrelationId("org_a", "corr_3", NOW);
    render(<CorrelationSearch query="corr_3" outcome={outcome} />);
    expect(screen.getByText(/the request, or the feed's definition/)).toBeTruthy();
  });

  it("says an unknown id is unknown here, and an old one is out of the window", () => {
    const { rerender } = render(<CorrelationSearch query="x" outcome={{ kind: "not-found" }} />);
    expect(screen.getByText(/No call in this organization has that correlation id/)).toBeTruthy();
    rerender(<CorrelationSearch query="x" outcome={{ kind: "outside-window", windowDays: 30 }} />);
    expect(screen.getByText(/older than 30 days/)).toBeTruthy();
  });
});

describe("service health on the SAP system screen", () => {
  const fresh = new Date("2026-10-20T11:00:00.000Z");

  it("sends a sign-in failure and a refused dataset to different owners", () => {
    const signIn = serviceHealthFactsOf({ metadataStatus: "UNAUTHORIZED", metadataAt: fresh, readStatus: null, readAt: null, readRowCount: null });
    const refused = serviceHealthFactsOf({ metadataStatus: "OK", metadataAt: fresh, readStatus: "FORBIDDEN", readAt: fresh, readRowCount: null });
    expect(ownerForService(signIn, NOW)).toBe("Platform admin");
    expect(ownerForService(refused, NOW)).toBe("Client SAP admin");
  });

  it("reads a 401 on the data read as the sign-in it is", () => {
    const facts = serviceHealthFactsOf({ metadataStatus: "OK", metadataAt: fresh, readStatus: "UNAUTHORIZED", readAt: fresh, readRowCount: null });
    expect(verdictForService(facts, NOW).status).toBe("signInRefused");
  });

  it("treats a probe that had no path as never checked, not as a fault", () => {
    const facts = serviceHealthFactsOf({ metadataStatus: "NO_PROBE_PATH", metadataAt: fresh, readStatus: null, readAt: null, readRowCount: null });
    expect(facts.metadataStatus).toBeNull();
    expect(verdictForService(facts, NOW).status).toBe("unknown");
  });

  it("keeps a proven read live, and EMPTY a success", () => {
    const live = serviceHealthFactsOf({ metadataStatus: "OK", metadataAt: fresh, readStatus: "OK", readAt: fresh, readRowCount: 3 });
    const empty = serviceHealthFactsOf({ metadataStatus: "OK", metadataAt: fresh, readStatus: "EMPTY", readAt: fresh, readRowCount: 0 });
    expect(verdictForService(live, NOW).status).toBe("live");
    expect(verdictForService(empty, NOW).status).toBe("noData");
  });
});
