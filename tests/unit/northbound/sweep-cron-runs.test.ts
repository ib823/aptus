/**
 * A sweep that fell behind is not recorded as a success (audit A34).
 *
 * Both maintenance sweeps returned `moreRemaining` and the routes recorded
 * `ok: true` regardless, with the flag inside the summary JSON. A backlog that
 * grew every night — rows kept past the stated retention period — read as a
 * healthy job every night. The run is now recorded not-ok when it stopped with
 * work left, and stays ok when it cleared.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as reapRoute } from "@/app/api/cron/northbound-reap/route";
import { GET as retentionRoute } from "@/app/api/cron/northbound-retention/route";
import type * as RetentionModule from "@/lib/northbound/retention";

const mocks = vi.hoisted(() => ({
  enforce: vi.fn(),
  reap: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/northbound/retention", async (importOriginal) => {
  const real = await importOriginal<typeof RetentionModule>();
  return { ...real, enforceNorthboundAuditRetention: mocks.enforce };
});
vi.mock("@/lib/northbound/reap", () => ({ reapExpiredIdempotencyKeys: mocks.reap }));
vi.mock("@/lib/ops/cron", () => ({ authorizeCron: () => true, recordCronRun: mocks.record }));

const req = (path: string) => new NextRequest(`https://x.test${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.record.mockResolvedValue(undefined);
});

describe("northbound-retention", () => {
  it("records a run that stopped with rows past the period as not ok", async () => {
    mocks.enforce.mockResolvedValue({
      deleted: 240_000,
      moreRemaining: true,
      retentionDays: 30,
      cutoff: "2026-09-19T03:45:00.000Z",
    });
    await retentionRoute(req("/api/cron/northbound-retention"));
    expect(mocks.record).toHaveBeenCalledWith(
      "northbound-retention",
      expect.any(Date),
      false,
      expect.objectContaining({ moreRemaining: true }),
    );
  });

  it("records a run that cleared the backlog as ok", async () => {
    mocks.enforce.mockResolvedValue({
      deleted: 8_640,
      moreRemaining: false,
      retentionDays: 30,
      cutoff: "2026-09-19T03:45:00.000Z",
    });
    await retentionRoute(req("/api/cron/northbound-retention"));
    expect(mocks.record).toHaveBeenCalledWith("northbound-retention", expect.any(Date), true, expect.anything());
  });
});

describe("northbound-reap", () => {
  it("records a run that stopped with expired keys left as not ok", async () => {
    mocks.reap.mockResolvedValue({ deleted: 90_000, moreRemaining: true });
    await reapRoute(req("/api/cron/northbound-reap"));
    expect(mocks.record).toHaveBeenCalledWith(
      "northbound-reap",
      expect.any(Date),
      false,
      expect.objectContaining({ moreRemaining: true }),
    );
  });

  it("records a run that cleared them as ok", async () => {
    mocks.reap.mockResolvedValue({ deleted: 12, moreRemaining: false });
    await reapRoute(req("/api/cron/northbound-reap"));
    expect(mocks.record).toHaveBeenCalledWith("northbound-reap", expect.any(Date), true, expect.anything());
  });
});
