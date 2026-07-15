/**
 * ABeam Workbench — Affirm external serializer WALKER test (the leak boundary).
 *
 * Mirrors the presales redaction walker (tests/unit/presales/redaction.test.ts).
 * Recursively walks every object the external serializers and getAffirmSetForGrant
 * produce, asserting banned keys never appear at any depth. If you add a field
 * to a guest serializer, update BANNED_KEYS and the allowlist together — a
 * mismatch is the fastest way to introduce a leak.
 *
 * Also verifies grant value-stream scoping: a grant limited to one stream must
 * only ever see that stream's questions + scope items + flows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  grantFindUnique: vi.fn(),
  bundleFindUnique: vi.fn(),
  scopeFindMany: vi.fn(),
  getAffirmSetForBundle: vi.fn(),
  getProcessFlowsForBundle: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    affirmAccessGrant: { findUnique: mocks.grantFindUnique },
    affirmBundle: { findUnique: mocks.bundleFindUnique },
    affirmBundleScopeItem: { findMany: mocks.scopeFindMany },
  },
}));
vi.mock("@/lib/affirm/queries", () => ({ getAffirmSetForBundle: mocks.getAffirmSetForBundle }));
vi.mock("@/lib/affirm/process-flow", () => ({
  getProcessFlowsForBundle: mocks.getProcessFlowsForBundle,
}));

import {
  getAffirmSetForGrant,
  toGuestFlow,
  toGuestQuestion,
  toGuestScopeItem,
} from "@/lib/affirm/external/serializers";

// Keys that must NEVER reach the external surface.
const BANNED_KEYS = [
  "statusNote",
  "flag",
  "enabled",
  "sscuiRef",
  "status",
  "isCustom",
  "createdById",
  "createdBy",
  "effort",
  "effortDays",
  "ricefw_class",
  "ext_impact",
  "custom_type",
];

function collectKeysAtAnyDepth(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 50 || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const v of value) collectKeysAtAnyDepth(v, found, depth + 1);
    return found;
  }
  for (const [k, v] of Object.entries(value)) {
    found.add(k);
    collectKeysAtAnyDepth(v, found, depth + 1);
  }
  return found;
}

// A raw AffirmQuestionRow carrying every banned field an internal row might hold.
const RAW_ROW = {
  id: "L2-001",
  streamId: "lead-to-cash",
  streamName: "Lead to Cash",
  subProcessId: "lead-to-cash::order",
  subProcessName: "Order",
  sapVerbatim: "SAP verbatim text",
  plainLanguageSuggested: "Plain language",
  consultantWording: "Consultant wording",
  aboutText: "About",
  standardMeans: "Standard means",
  sapArea: "Sales",
  sapTopic: "Order to Cash",
  sscuiRef: "102495",
  scopeItemRefs: ["BD9"],
  status: "confirmed",
  flag: "config-how-to",
  statusNote: "internal note",
  displayOrder: 1,
  isCustom: true,
  createdById: "user-1",
  effort: 5,
  format: "decision" as const,
  enabled: true,
};

describe("guest serializer mappers strip banned keys", () => {
  it("toGuestQuestion emits no banned key at any depth", () => {
    const keys = collectKeysAtAnyDepth(toGuestQuestion(RAW_ROW as never));
    for (const banned of BANNED_KEYS) expect(keys.has(banned)).toBe(false);
    // sanity: it DID keep the client-facing wording
    expect(keys.has("plainLanguageSuggested")).toBe(true);
    expect(keys.has("sapVerbatim")).toBe(true);
  });

  it("toGuestScopeItem emits no banned key", () => {
    const raw = {
      id: "BD9",
      description: "Sell from stock",
      streamId: "lead-to-cash",
      subProcessId: "lead-to-cash::order",
      hasBdcCoverage: true,
      placementReviewFlag: "pending-curation",
    };
    const keys = collectKeysAtAnyDepth(toGuestScopeItem(raw as never));
    for (const banned of BANNED_KEYS) expect(keys.has(banned)).toBe(false);
    expect(keys.has("hasBdcCoverage")).toBe(false);
    expect(keys.has("placementReviewFlag")).toBe(false);
  });

  it("toGuestFlow emits only display-safe step fields", () => {
    const flow = {
      scopeItemId: "BD9",
      sapRelease: "2602",
      country: "MY",
      activityCount: 3,
      optionalCount: 0,
      myStepCount: 3,
      steps: [{ stepNumber: 1, activity: "Create order", fioriApps: ["F0018"], effort: 9 }],
    };
    const keys = collectKeysAtAnyDepth(toGuestFlow(flow as never));
    expect(keys.has("effort")).toBe(false);
    expect(keys.has("activity")).toBe(true);
    expect(keys.has("fioriApps")).toBe(true);
  });
});

describe("getAffirmSetForGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grantFindUnique.mockResolvedValue({
      bundleId: "bundle-1",
      valueStreamIds: ["lead-to-cash"], // scoped to ONE stream
    });
    mocks.bundleFindUnique.mockResolvedValue({ client: "Acme Bhd", state: "issued" });
    mocks.getAffirmSetForBundle.mockResolvedValue([
      { ...RAW_ROW, id: "L2-001", streamId: "lead-to-cash" },
      { ...RAW_ROW, id: "L2-050", streamId: "source-to-pay", streamName: "Source to Pay" },
    ]);
    mocks.scopeFindMany.mockResolvedValue([
      { scopeItem: { id: "BD9", description: "d", streamId: "lead-to-cash", subProcessId: "sp1" } },
      { scopeItem: { id: "J45", description: "d", streamId: "source-to-pay", subProcessId: "sp2" } },
    ]);
    mocks.getProcessFlowsForBundle.mockResolvedValue(
      new Map([
        ["BD9", { scopeItemId: "BD9", sapRelease: "2602", country: "MY", activityCount: 1, optionalCount: 0, myStepCount: 1, steps: [] }],
        ["J45", { scopeItemId: "J45", sapRelease: "2602", country: "MY", activityCount: 1, optionalCount: 0, myStepCount: 1, steps: [] }],
      ]),
    );
  });

  it("filters questions, scope items, and flows to the grant's value streams", async () => {
    const set = await getAffirmSetForGrant("grant-1");
    expect(set).not.toBeNull();
    expect(set!.questions.map((q) => q.id)).toEqual(["L2-001"]); // source-to-pay dropped
    expect(set!.scopeItems.map((s) => s.id)).toEqual(["BD9"]);
    expect(Object.keys(set!.flows)).toEqual(["BD9"]);
  });

  it("empty valueStreamIds means all streams", async () => {
    mocks.grantFindUnique.mockResolvedValue({ bundleId: "bundle-1", valueStreamIds: [] });
    const set = await getAffirmSetForGrant("grant-1");
    expect(set!.questions.map((q) => q.id).sort()).toEqual(["L2-001", "L2-050"]);
  });

  it("the whole set contains no banned key at any depth", async () => {
    const set = await getAffirmSetForGrant("grant-1");
    const keys = collectKeysAtAnyDepth(set);
    for (const banned of BANNED_KEYS) expect(keys.has(banned)).toBe(false);
  });

  it("returns null for an unknown grant", async () => {
    mocks.grantFindUnique.mockResolvedValue(null);
    expect(await getAffirmSetForGrant("nope")).toBeNull();
  });
});
