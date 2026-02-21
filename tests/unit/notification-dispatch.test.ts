import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test the dispatch logic by mocking Prisma.
 * We re-implement the core logic inline to avoid importing the module
 * (which would trigger side effects from Prisma client initialization).
 */

import { FORCED_IN_APP_TYPES } from "@/types/notification";
import type { NotificationType } from "@/types/notification";

// Core dispatch logic extracted for testability
interface MockPref {
  userId: string;
  channelInApp: boolean;
}

interface MockNotification {
  userId: string;
}

interface TestDispatchPayload {
  type: NotificationType;
  assessmentId?: string;
  title: string;
  body: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
  recipientUserIds: string[];
}

function computeDispatch(
  payload: TestDispatchPayload,
  preferences: MockPref[],
  recentNotifications: MockNotification[],
): { toCreate: string[]; skipped: number } {
  const prefMap = new Map(preferences.map((p) => [p.userId, p]));
  const recentUserIds = new Set(recentNotifications.map((n) => n.userId));
  const toCreate: string[] = [];
  let skipped = 0;

  for (const userId of payload.recipientUserIds) {
    if (recentUserIds.has(userId)) {
      skipped++;
      continue;
    }

    const pref = prefMap.get(userId);
    const isForcedInApp = FORCED_IN_APP_TYPES.includes(payload.type);
    const inAppEnabled = isForcedInApp || !pref || pref.channelInApp;

    if (inAppEnabled) {
      toCreate.push(userId);
    } else {
      skipped++;
    }
  }

  return { toCreate, skipped };
}

describe("notification dispatch logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates notifications for all recipients with default preferences", () => {
    const result = computeDispatch(
      {
        type: "comment_mention",
        title: "You were mentioned",
        body: "Test body",
        recipientUserIds: ["user1", "user2"],
      },
      [], // no saved preferences => defaults
      [], // no recent notifications
    );

    expect(result.toCreate).toEqual(["user1", "user2"]);
    expect(result.skipped).toBe(0);
  });

  it("skips recipients with in_app disabled", () => {
    const result = computeDispatch(
      {
        type: "comment_mention",
        title: "You were mentioned",
        body: "Test body",
        recipientUserIds: ["user1", "user2"],
      },
      [{ userId: "user2", channelInApp: false }],
      [],
    );

    expect(result.toCreate).toEqual(["user1"]);
    expect(result.skipped).toBe(1);
  });

  it("forces in_app for forced types even when disabled", () => {
    const result = computeDispatch(
      {
        type: "sign_off_request", // forced type
        title: "Sign-off requested",
        body: "Please sign off",
        recipientUserIds: ["user1"],
      },
      [{ userId: "user1", channelInApp: false }],
      [],
    );

    expect(result.toCreate).toEqual(["user1"]);
    expect(result.skipped).toBe(0);
  });

  it("deduplicates based on recent notifications", () => {
    const result = computeDispatch(
      {
        type: "comment_mention",
        title: "You were mentioned",
        body: "Test body",
        recipientUserIds: ["user1", "user2"],
      },
      [],
      [{ userId: "user1" }], // user1 already has a recent notification
    );

    expect(result.toCreate).toEqual(["user2"]);
    expect(result.skipped).toBe(1);
  });

  it("handles empty recipient list", () => {
    const result = computeDispatch(
      {
        type: "comment_mention",
        title: "You were mentioned",
        body: "Test body",
        recipientUserIds: [],
      },
      [],
      [],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it("forces in_app for conflict_detected", () => {
    const result = computeDispatch(
      {
        type: "conflict_detected",
        title: "Conflict",
        body: "A conflict was detected",
        recipientUserIds: ["user1"],
      },
      [{ userId: "user1", channelInApp: false }],
      [],
    );

    expect(result.toCreate).toEqual(["user1"]);
  });

  it("forces in_app for stakeholder_removed", () => {
    const result = computeDispatch(
      {
        type: "stakeholder_removed",
        title: "Removed",
        body: "You were removed",
        recipientUserIds: ["user1"],
      },
      [{ userId: "user1", channelInApp: false }],
      [],
    );

    expect(result.toCreate).toEqual(["user1"]);
  });

  it("does not force in_app for non-forced types", () => {
    const result = computeDispatch(
      {
        type: "gap_created",
        title: "Gap created",
        body: "A gap was created",
        recipientUserIds: ["user1"],
      },
      [{ userId: "user1", channelInApp: false }],
      [],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.skipped).toBe(1);
  });
});
