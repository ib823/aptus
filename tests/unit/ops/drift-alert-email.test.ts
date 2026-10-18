/**
 * The drift alert email carries no markup it did not write.
 *
 * Its detail used to be one of the probe's fixed sentences. It can now quote a
 * SuccessFactors refusal, and SuccessFactors echoes request values back — so a
 * value typed into a connection could reach every platform admin's inbox as a
 * live link that looks like a CoreEdge message. The label is typed by a
 * builder, too. Everything interpolated into the HTML is escaped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  createEvent: vi.fn(),
  findAdmins: vi.fn(),
  sendEmail: vi.fn(),
  resolveSapConnections: vi.fn(),
  probeConnection: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sapConnection: { findMany: mocks.findMany, update: mocks.update },
    sapConnectionProbeEvent: { create: mocks.createEvent },
    user: { findMany: mocks.findAdmins },
  },
}));
vi.mock("@/lib/db/tenant-guard", () => ({ permitCrossTenantReads: vi.fn() }));
vi.mock("@/lib/email/brevo", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ResolverModule>();
  return { ...actual, resolveSapConnections: mocks.resolveSapConnections };
});
vi.mock("@/lib/studio/connection-health", () => ({
  probeConnection: mocks.probeConnection,
  resolveProbePath: () => "/odata/v2",
}));

import { sweepConnectionProbes } from "@/lib/ops/connection-probe-sweep";

const LABEL = '<img src="https://evil.example/pixel">Acme SF';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([
    {
      id: "conn_1",
      organizationId: "org_a",
      product: "successfactors",
      key: "zvcsf",
      label: LABEL,
      environment: "DEV",
      lastValidationStatus: "OK",
    },
  ]);
  mocks.resolveSapConnections.mockResolvedValue([{ id: "conn_1", key: "zvcsf" }]);
  mocks.probeConnection.mockResolvedValue({
    status: "UNAUTHORIZED",
    httpStatus: 401,
    detail: 'SuccessFactors refused the token request (HTTP 401): company "<a href=x>Re-authenticate</a>" is inactive.',
    durationMs: 40,
  });
  mocks.findAdmins.mockResolvedValue([{ email: "admin@acme.example" }]);
  mocks.sendEmail.mockResolvedValue(undefined);
});

describe("the drift alert email", () => {
  it("escapes the detail and the label before they enter the HTML", async () => {
    const result = await sweepConnectionProbes();
    expect(result.alertsSent).toBe(1);

    const { htmlContent } = mocks.sendEmail.mock.calls[0]![0] as { htmlContent: string };
    expect(htmlContent).not.toContain("<a ");
    expect(htmlContent).not.toContain("<img");
    expect(htmlContent).toContain("&lt;a href=x&gt;Re-authenticate&lt;/a&gt;");
    expect(htmlContent).toContain("&lt;img src=&quot;https://evil.example/pixel&quot;&gt;Acme SF");
    // Its own markup is untouched.
    expect(htmlContent).toContain("<strong>UNAUTHORIZED</strong>");
  });
});
