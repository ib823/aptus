/**
 * The throttle gauge and the incident derivation.
 *
 * TWO PROPERTIES CARRY THESE ENDPOINTS, and both fail silently:
 *
 *   1. The throttle gauge must not SPEND the budget it reports. `checkRateLimit`
 *      consumes a token; `peekRateLimit` does not. A console polling the wrong
 *      one would eat a customer's per-credential budget and, on the tight
 *      northbound bucket, manufacture the 429s it exists to warn about. The
 *      first test below proves non-consumption end to end rather than by
 *      inspecting which function was imported: it peeks far more times than the
 *      limit allows and then asserts a real call still gets through.
 *
 *   2. An incident severity must be reproducible from the source. A badge
 *      reading CRITICAL that nobody can trace to a rule is a fabricated
 *      judgement, which is the one thing this product is built not to ship. So
 *      the rules are constants, the derivation is pure, and it is tested
 *      directly against its thresholds.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  deriveIncidents,
  INCIDENT_RULES,
  INCIDENT_THRESHOLDS,
  type IncidentSignals,
} from "@/lib/ops/incidents";

describe("peeking the budget never spends it", () => {
  it("survives far more peeks than the limit, and a real call still passes", async () => {
    // The end-to-end version of the claim. If `peekRateLimit` consumed, sixty
    // peeks against a limit of sixty would exhaust the bucket and the
    // checkRateLimit below would be refused — which is exactly what a dashboard
    // polling this endpoint would do to a customer's credential.
    vi.resetModules();
    const { peekRateLimit, checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    const key = `northbound:cl_peek_${Math.random()}`;

    for (let i = 0; i < RATE_LIMITS.northbound.limit * 3; i++) {
      const peek = await peekRateLimit(key, RATE_LIMITS.northbound);
      // Unspent, so it never moves.
      expect(peek?.remaining).toBe(RATE_LIMITS.northbound.limit);
    }

    const real = await checkRateLimit(key, RATE_LIMITS.northbound);
    expect(real.allowed, "peeking must not have consumed the budget").toBe(true);
  });

  it("and a real call DOES move what a subsequent peek reports", async () => {
    // The converse. Without this, the test above passes against a peek that is
    // hardcoded to return the full limit.
    vi.resetModules();
    const { peekRateLimit, checkRateLimit, RATE_LIMITS } = await import("@/lib/security/rate-limit");
    const key = `northbound:cl_spend_${Math.random()}`;

    await checkRateLimit(key, RATE_LIMITS.northbound);
    const peek = await peekRateLimit(key, RATE_LIMITS.northbound);
    expect(peek?.remaining).toBe(RATE_LIMITS.northbound.limit - 1);
  });
});

describe("incident severities come from named rules, not from request-time scoring", () => {
  const none: IncidentSignals = {
    bindingRefusals: 0,
    unhealthyConnections: 0,
    upstreamErrors: 0,
    throttled: 0,
    expiringCredentials: 0,
    undeclaredEnvironmentConnections: 0,
    unboundedGrants: 0,
    credentialsWithoutExpiry: 0,
    unaccountableProdGrants: 0,
    driftingConnections: 0,
  };

  it("reports nothing when every signal is below its threshold", () => {
    expect(deriveIncidents(none)).toEqual([]);
  });

  it("does not fire a noisy rule on a single occurrence", () => {
    // Paging on one transient SAP 5xx trains people to ignore the screen.
    expect(deriveIncidents({ ...none, upstreamErrors: 1 })).toEqual([]);
    expect(deriveIncidents({ ...none, throttled: 1 })).toEqual([]);
  });

  it("fires exactly at the threshold, not one past it", () => {
    for (const [signal, threshold] of [
      ["upstreamErrors", INCIDENT_THRESHOLDS.upstreamErrors],
      ["throttled", INCIDENT_THRESHOLDS.throttled],
    ] as const) {
      expect(deriveIncidents({ ...none, [signal]: threshold - 1 }), `${signal} below`).toEqual([]);
      expect(deriveIncidents({ ...none, [signal]: threshold }), `${signal} at`).toHaveLength(1);
    }
  });

  it("treats a single environment-binding mismatch as critical", () => {
    // One is too many: the call already happened, against a landscape nobody
    // declared, and the audit row records the credential's environment — so the
    // record itself understates it.
    const [incident] = deriveIncidents({ ...none, bindingRefusals: 1 });
    expect(incident?.id).toBe(INCIDENT_RULES.bindingRefused.id);
    expect(incident?.severity).toBe("critical");
    expect(incident?.observed).toBe(1);
    expect(incident?.threshold).toBe(1);
  });

  it("ranks critical above major above minor", () => {
    const incidents = deriveIncidents({
      bindingRefusals: 2,
      unhealthyConnections: 1,
      upstreamErrors: 50,
      throttled: 99,
      expiringCredentials: 3,
      undeclaredEnvironmentConnections: 4,
      unboundedGrants: 0,
      credentialsWithoutExpiry: 0,
      unaccountableProdGrants: 0,
      driftingConnections: 0,
    });
    expect(incidents.map((i) => i.severity)).toEqual([
      "critical",
      "major",
      "major",
      "minor",
      "minor",
      "minor",
    ]);
  });

  it("carries the rule's threshold and reasoning on every incident it emits", () => {
    // The property that makes a severity checkable rather than asserted.
    for (const incident of deriveIncidents({
      ...none,
      bindingRefusals: 1,
      unhealthyConnections: 1,
      undeclaredEnvironmentConnections: 1,
    unboundedGrants: 0,
    credentialsWithoutExpiry: 0,
    unaccountableProdGrants: 0,
    })) {
      expect(incident.firesWhen, incident.id).toBeTruthy();
      expect(incident.whyThisSeverity, incident.id).toBeTruthy();
      expect(incident.remediation, incident.id).toBeTruthy();
      expect(incident.observed).toBeGreaterThanOrEqual(incident.threshold);
    }
  });

  it("is pure — same signals, same incidents", () => {
    const signals = { ...none, upstreamErrors: 9 };
    expect(deriveIncidents(signals)).toEqual(deriveIncidents(signals));
  });

  it("every rule has a threshold, and every threshold has a rule", () => {
    // A rule with no threshold cannot fire; a threshold with no rule is dead
    // configuration that reads as though something is being watched.
    const ruleIds = Object.values(INCIDENT_RULES).map((r) => r.id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect(Object.keys(INCIDENT_THRESHOLDS).sort()).toEqual(Object.keys(INCIDENT_RULES).sort());
  });
});

describe("the throttle endpoint is honest about which buckets it can see", () => {
  const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    clientFindMany: vi.fn(),
  solutionFindMany: vi.fn(async () => []),
    auditGroupBy: vi.fn(),
  }));

  beforeEach(() => {
    vi.resetModules();
    mocks.getCurrentUser.mockReset().mockResolvedValue({
      id: "u_s",
      email: "support@abeam.test",
      role: "support",
      organizationId: "org_a",
    });
    mocks.clientFindMany.mockReset().mockResolvedValue([
      { id: "cl_1", solutionId: "sol_1", label: "Acme prod", environment: "PROD" },
    ]);
    mocks.auditGroupBy.mockReset().mockResolvedValue([]);
  });

  vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
  vi.mock("@/lib/db/prisma", () => ({
    prisma: {
      solutionClient: { findMany: mocks.clientFindMany },
      northboundAuditEvent: { groupBy: mocks.auditGroupBy },
      // Solution names are resolved separately (SolutionClient has no Prisma
      // relation to Solution) so this screen can name a credential the same way
      // the Credential Register does.
      solution: { findMany: mocks.solutionFindMany },
    },
  }));

  async function body() {
    const { GET } = await import("@/app/api/ops/throttle/route");
    const res = await GET(new NextRequest("https://x.test/api/ops/throttle"));
    return (await res.json()).data;
  }

  it("labels the IP-keyed middleware buckets as unobservable, never as per-tenant", async () => {
    // These fire before the route, persist nothing, and are keyed by an address
    // we cannot enumerate. Reporting a usage figure for them would be a
    // fabrication, and a convincing one.
    const data = await body();
    const edge = data.buckets.filter((b: { keyedBy: string }) => b.keyedBy === "client IP");
    expect(edge.length).toBe(2);
    for (const b of edge) expect(b.observable).toBe(false);

    const perCredential = data.buckets.filter((b: { keyedBy: string }) => b.keyedBy === "credential");
    expect(perCredential.length).toBe(2);
    for (const b of perCredential) expect(b.observable).toBe(true);
  });

  it("reports headroom per credential from the real limit", async () => {
    const data = await body();
    expect(data.credentials).toHaveLength(1);
    expect(data.credentials[0].read.known).toBe(true);
    expect(data.credentials[0].read.limit).toBe(60);
    expect(data.credentials[0].throttledInWindow).toBe(0);
  });

  it("counts audited 429s per credential and says they are a floor", async () => {
    mocks.auditGroupBy.mockResolvedValue([
      { clientTokenId: "cl_1", operation: "READ", _count: { _all: 4 } },
      { clientTokenId: "cl_1", operation: "WRITE", _count: { _all: 2 } },
    ]);
    const data = await body();
    expect(data.credentials[0].throttledInWindow).toBe(6);
    expect(data.provenance.throttleCountsAreAFloor).toContain("edge bucket");
  });

  it("scopes the credential query to the caller's organization", async () => {
    await body();
    expect(mocks.clientFindMany.mock.calls[0]?.[0]?.where?.organizationId).toBe("org_a");
  });

  it("says which backend is enforcing the limits, rather than hedging", async () => {
    // Found by reading a live production response: the in-memory caveat was
    // printed unconditionally. On a deployment WITH a shared backend that tells
    // an operator their headroom is per-instance when it is deployment-wide;
    // on one without, it buries a real configuration fault among routine notes.
    // The code knows which it is, so it reports it.
    const data = await body();
    expect(["shared", "in-memory"]).toContain(data.provenance.backend);
    expect(data.provenance.headroomIsPerInstance).toBe(data.provenance.backend === "in-memory");
    expect(data.provenance.backendNote).toBeTruthy();
    // No `UPSTASH_*` in the test environment, so this run is the unconfigured
    // case — and it must say so in terms an operator would act on.
    expect(data.provenance.backend).toBe("in-memory");
    expect(data.provenance.backendNote).toContain("NO SHARED RATE-LIMIT BACKEND");
  });

  it("reaches for the non-consuming primitive, and never the consuming one", async () => {
    // The behavioural test above proves `peekRateLimit` does not consume. This
    // proves the ROUTE uses it — the two are separate claims, and the second is
    // the one that regresses when someone reaches for the obvious function.
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const src = readFileSync(
      path.resolve(process.cwd(), "src/app/api/ops/throttle/route.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

    expect(src).toContain("peekRateLimit");
    expect(src, "a consuming check on a polled gauge spends the caller's budget").not.toContain(
      "checkRateLimit",
    );
  });
});
