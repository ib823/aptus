/**
 * A claim link against everything else that can happen to its lane.
 *
 * A link is sent against one state of an app and opened up to 72 hours later
 * against another. These drive the REAL issue, rotate, revoke, claim,
 * write-key and authenticate code over one in-memory store, in the order the
 * audit found them going wrong, and read what is left afterwards:
 *
 *   A12  a key revoked after the link went out came back to life on claim;
 *   A36  a link opened after the app was retired minted, and revived, a key;
 *   A39  a link opened after Studio issued a key silently killed that key;
 *   A37  a revoked credential kept its write key, so any revival restored it;
 *   A48  renewing an expired key kept the old expiry, so it arrived refused;
 *   A01  ownership was never re-checked, at send or at claim.
 *
 * Time is the system clock, moved explicitly, because "after the link was
 * sent" is the property under test and the code reads `new Date()`.
 */

import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { laneStore } = await import("../../helpers/credential-lane-store");
  return { prisma: laneStore.client };
});

import { laneStore } from "../../helpers/credential-lane-store";
import { authenticateClientToken } from "@/lib/northbound/auth";
import { claimKey, createClaimLink, inspectClaimLink } from "@/lib/northbound/claim-link";
import { issueClientToken, revokeClientToken, rotateClientToken } from "@/lib/northbound/issue";
import { setWriteCredential, verifyWriteCredential } from "@/lib/northbound/write-credential";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const ORG = "org_a";
const SCOPE = tenantScopeOf(ORG);
const SENDER = "u_sender";
const STUDIO_ISSUER = "u_issuer";

const DAY = 24 * 60 * 60 * 1000;
const DAY_0 = new Date("2026-10-01T09:00:00Z");
const at = (days: number) => new Date(DAY_0.getTime() + days * DAY);

const KEY_ENV = "SAP_CONNECTION_ENCRYPTION_KEY";
let originalKey: string | undefined;

beforeAll(() => {
  originalKey = process.env[KEY_ENV];
  process.env[KEY_ENV] = randomBytes(32).toString("hex");
});
afterAll(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  laneStore.reset();
  laneStore.solutions.push({
    id: "sol_1",
    organizationId: ORG,
    name: "Finance accelerator",
    status: "ACTIVE",
    technicalOwnerId: "u_tech",
    businessOwnerId: "u_biz",
    supportOwnerId: "u_sup",
  });
});
afterEach(() => {
  vi.useRealTimers();
});

function moveTo(when: Date): void {
  vi.setSystemTime(when);
}

async function sendLink(environment = "PROD"): Promise<string> {
  const link = await createClaimLink({
    organizationId: ORG,
    solutionId: "sol_1",
    environment,
    createdById: SENDER,
    now: new Date(),
  });
  return link.rawToken;
}

async function issueInStudio(expiresAt: Date | null = null) {
  return issueClientToken(SCOPE, {
    solutionId: "sol_1",
    label: "prod",
    environment: "PROD",
    createdById: STUDIO_ISSUER,
    expiresAt,
  });
}

const lane = () => laneStore.clients.find((c) => c.environment === "PROD");
const onlyLink = () => {
  expect(laneStore.links).toHaveLength(1);
  return laneStore.links[0]!;
};

describe("A12 · a revocation is not undone by a link that was already out", () => {
  it("send a link, revoke the key, open the link: refused, and the key stays revoked", async () => {
    moveTo(at(-1));
    const issued = await issueInStudio();
    moveTo(at(0));
    const link = await sendLink();

    moveTo(at(1));
    await revokeClientToken(SCOPE, issued.id);
    const revokedHash = lane()!.tokenHash;

    moveTo(at(2));
    const result = await claimKey(link);

    expect(result.ok).toBe(false);
    expect(lane()).toMatchObject({ isActive: false, tokenHash: revokedHash });
    expect(lane()!.revokedAt).toEqual(at(1));
    // Closed by the revocation itself, with the reason recorded.
    expect(onlyLink()).toMatchObject({ claimedAt: null, revokedReason: "The key was revoked." });
  });

  it("refuses on its own at claim time, even if the link had somehow stayed open", async () => {
    moveTo(at(-1));
    const issued = await issueInStudio();
    moveTo(at(0));
    const link = await sendLink();
    moveTo(at(1));
    await revokeClientToken(SCOPE, issued.id);
    // Defence in depth: undo the closure, as a link written by an older build would be.
    Object.assign(onlyLink(), { revokedAt: null, revokedReason: null });

    moveTo(at(2));
    expect(await inspectClaimLink(link)).toEqual({ ok: false, refusal: "KEY_REVOKED" });
    expect(await claimKey(link)).toEqual({ ok: false, refusal: "KEY_REVOKED" });
    expect(lane()).toMatchObject({ isActive: false });
    expect(onlyLink()).toMatchObject({ claimedAt: null, revokedReason: "The key was revoked." });
  });

  it("still lets a link sent AFTER the revocation re-key the lane — a deliberate act", async () => {
    moveTo(at(-1));
    const issued = await issueInStudio();
    moveTo(at(0));
    await revokeClientToken(SCOPE, issued.id);

    moveTo(at(1));
    const link = await sendLink();
    const result = await claimKey(link);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await authenticateClientToken(result.rawToken)).ok).toBe(true);
  });
});

describe("A36 · a link opened after the app was retired mints nothing", () => {
  it("refuses, creates no key, and records why", async () => {
    moveTo(at(0));
    const link = await sendLink();
    laneStore.solutions[0]!.status = "RETIRED";

    moveTo(at(1));
    expect(await inspectClaimLink(link)).toEqual({ ok: false, refusal: "SOLUTION_RETIRED" });
    expect(await claimKey(link)).toEqual({ ok: false, refusal: "SOLUTION_RETIRED" });
    expect(laneStore.clients).toHaveLength(0);
    expect(onlyLink()).toMatchObject({ claimedAt: null, revokedReason: "The app was retired." });
  });

  it("does not revive the key revoked as part of retiring it", async () => {
    moveTo(at(-1));
    const issued = await issueInStudio();
    moveTo(at(0));
    const link = await sendLink();
    moveTo(at(1));
    laneStore.solutions[0]!.status = "RETIRED";
    await revokeClientToken(SCOPE, issued.id);

    const revokedHash = lane()!.tokenHash;

    moveTo(at(2));
    expect((await claimKey(link)).ok).toBe(false);
    // No token was minted onto the row, so reactivating the app later (one
    // ungated PATCH to DRAFT) wakes nothing.
    expect(lane()).toMatchObject({ isActive: false, tokenHash: revokedHash });
    expect(lane()!.revokedAt).toEqual(at(1));
  });
});

describe("A39 · a link opened after a key was issued elsewhere does not kill it", () => {
  it("Studio issues a key while a link is out: the link is closed and the key keeps working", async () => {
    moveTo(at(0));
    const link = await sendLink();

    moveTo(at(0.25));
    const t1 = await issueInStudio();
    expect((await authenticateClientToken(t1.rawToken)).ok).toBe(true);
    expect(onlyLink()).toMatchObject({ revokedReason: "A key was issued for this environment." });

    moveTo(at(2));
    expect((await claimKey(link)).ok).toBe(false);
    expect((await authenticateClientToken(t1.rawToken)).ok).toBe(true);
  });

  it("refuses on its own if a key appeared after the link was sent", async () => {
    moveTo(at(0));
    const link = await sendLink();
    moveTo(at(0.25));
    const t1 = await issueInStudio();
    Object.assign(onlyLink(), { revokedAt: null, revokedReason: null });

    moveTo(at(2));
    expect(await claimKey(link)).toEqual({ ok: false, refusal: "KEY_ISSUED_SINCE" });
    expect((await authenticateClientToken(t1.rawToken)).ok).toBe(true);
  });

  it("a rotation while a link is out closes it too", async () => {
    moveTo(at(-1));
    const issued = await issueInStudio();
    moveTo(at(0));
    const link = await sendLink();
    moveTo(at(1));
    const rotated = await rotateClientToken(SCOPE, issued.id);

    moveTo(at(2));
    expect((await claimKey(link)).ok).toBe(false);
    expect((await authenticateClientToken(rotated!.rawToken)).ok).toBe(true);
    expect(onlyLink()).toMatchObject({ revokedReason: "The key for this environment was rotated." });
  });

  it("a claim that does mint is audited, as ISSUE or as ROTATE, under the sender", async () => {
    moveTo(at(0));
    const first = await claimKey(await sendLink());
    expect(first.ok).toBe(true);

    moveTo(at(1));
    const second = await claimKey(await sendLink());
    expect(second.ok).toBe(true);

    const claims = laneStore.audits.filter(
      (a) => (a.after as { event?: string } | undefined)?.event === "claim_link_claimed",
    );
    expect(claims.map((a) => a.action)).toEqual(["ISSUE", "ROTATE"]);
    expect(claims.every((a) => a.actorId === SENDER && a.entityType === "ClientCredential")).toBe(true);
    // The audit row never carries the key.
    if (second.ok) expect(JSON.stringify(laneStore.audits)).not.toContain(second.rawToken);
  });
});

describe("A37 · revoking a credential destroys its write key", () => {
  const WRITE_KEY = "cew_taken_with_the_server";

  async function liveKeyWithWriteKey() {
    moveTo(at(-1));
    const issued = await issueInStudio();
    expect(await setWriteCredential(SCOPE, issued.id, WRITE_KEY)).toBe(true);
    expect(await verifyWriteCredential(SCOPE, issued.id, WRITE_KEY)).toBe(true);
    return issued;
  }

  it("seal, revoke, re-issue in Studio: the old write key no longer verifies", async () => {
    const issued = await liveKeyWithWriteKey();
    moveTo(at(0));
    await revokeClientToken(SCOPE, issued.id);
    moveTo(at(1));
    const again = await issueInStudio();

    expect(again.id).toBe(issued.id);
    expect((await authenticateClientToken(again.rawToken)).ok).toBe(true);
    expect(await verifyWriteCredential(SCOPE, again.id, WRITE_KEY)).toBe(false);
  });

  it("seal, revoke, re-key by claim link: the old write key no longer verifies", async () => {
    const issued = await liveKeyWithWriteKey();
    moveTo(at(0));
    await revokeClientToken(SCOPE, issued.id);
    moveTo(at(1));
    const result = await claimKey(await sendLink());

    expect(result.ok).toBe(true);
    expect(await verifyWriteCredential(SCOPE, issued.id, WRITE_KEY)).toBe(false);
  });

  it("a row revoked before this fix, still holding its write key, loses it on any revival", async () => {
    for (const revive of ["issue", "rotate", "claim"] as const) {
      laneStore.clients = [];
      laneStore.links = [];
      const issued = await liveKeyWithWriteKey();
      // Revoked the old way: flags only, write key left on the row.
      Object.assign(lane()!, { isActive: false, revokedAt: at(-0.5) });

      moveTo(at(0));
      if (revive === "issue") await issueInStudio();
      if (revive === "rotate") await rotateClientToken(SCOPE, issued.id);
      if (revive === "claim") expect((await claimKey(await sendLink())).ok).toBe(true);

      expect(await verifyWriteCredential(SCOPE, issued.id, WRITE_KEY), revive).toBe(false);
    }
  });

  it("rotating a LIVE key keeps its write key — rotation is not a compromise", async () => {
    const issued = await liveKeyWithWriteKey();
    moveTo(at(0));
    await rotateClientToken(SCOPE, issued.id);
    expect(await verifyWriteCredential(SCOPE, issued.id, WRITE_KEY)).toBe(true);
  });
});

describe("A48 · renewing an expired key gives a key that works", () => {
  it("claim on an expired lane: the new key authenticates instead of arriving EXPIRED", async () => {
    moveTo(at(-30));
    await issueInStudio(at(-1));
    moveTo(at(0));
    expect((await authenticateClientToken("ce_unknown")).ok).toBe(false);

    const result = await claimKey(await sendLink());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await authenticateClientToken(result.rawToken)).toMatchObject({ ok: true });
  });

  it("rotate on an expired key: the same", async () => {
    moveTo(at(-30));
    const issued = await issueInStudio(at(-1));
    moveTo(at(0));
    const rotated = await rotateClientToken(SCOPE, issued.id);
    expect(await authenticateClientToken(rotated!.rawToken)).toMatchObject({ ok: true });
  });

  it("keeps an expiry that has not passed yet", async () => {
    moveTo(at(-1));
    await issueInStudio(at(30));
    moveTo(at(0));
    expect((await claimKey(await sendLink())).ok).toBe(true);
    expect(lane()!.expiresAt).toEqual(at(30));
  });
});

describe("A01 · ownership is asked again when the link is opened", () => {
  it("refuses when the sender has since become an owner", async () => {
    moveTo(at(0));
    const link = await sendLink();
    laneStore.solutions[0]!.technicalOwnerId = SENDER;

    moveTo(at(1));
    expect(await claimKey(link)).toEqual({ ok: false, refusal: "SENDER_OWNS_APP" });
    expect(laneStore.clients).toHaveLength(0);
  });

  it("refuses when the app has since lost an owner", async () => {
    moveTo(at(0));
    const link = await sendLink();
    laneStore.solutions[0]!.supportOwnerId = null;

    moveTo(at(1));
    expect(await claimKey(link)).toEqual({ ok: false, refusal: "OWNERS_MISSING" });
    expect(laneStore.clients).toHaveLength(0);
  });
});

describe("retiring the app closes its links in every environment", () => {
  it("is what the Studio PATCH calls", async () => {
    // The route test pins the call; this pins that the call closes every lane.
    const { closePendingClaimLinks } = await import("@/lib/northbound/issue");
    moveTo(at(0));
    await sendLink("PROD");
    await sendLink("TEST");

    expect(await closePendingClaimLinks({ organizationId: ORG, solutionId: "sol_1" }, "The app was retired.")).toBe(2);
    expect(laneStore.links.every((l) => l.revokedReason === "The app was retired.")).toBe(true);
  });
});
