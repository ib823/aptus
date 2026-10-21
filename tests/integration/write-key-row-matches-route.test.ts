// @vitest-environment node
/**
 * The "Issue write key" action on API Access says what the write-key route
 * will do (P0.3 review round 2) — the real page's query against real
 * PostgreSQL, then the real route, for every row.
 *
 * THE DEFECT. `writeKeyAction` judged the credential's state, the viewer's
 * ownership, the expiry rule and the write grant. It could not see the
 * route's gates 2 and 3: a RETIRED app (retiring closes claim links but
 * leaves credentials live, so the key still read "active") and an app whose
 * owner slots are not all held by live members. On both the row offered the
 * action, enabled, with no reason beside it, and every click came back 403.
 *
 * THE CHECK. Three apps with a live DEV credential and an approved DEV CREATE
 * grant, issued and approved through the routes: one ACTIVE and complete, one
 * then RETIRED, one whose support owner then leaves. The page is rendered as
 * the colleague who issues keys, and for every credential row it offers, the
 * route is called: an enabled row is accepted (201), and a disabled row is
 * refused for the reason the row gave.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import StudioAccessPage from "@/app/(studio)/studio/access/page";
import { PATCH as decideGrant, POST as requestGrant } from "@/app/api/studio/access-grants/route";
import { POST as issueKey } from "@/app/api/studio/clients/route";
import { POST as issueWriteKey } from "@/app/api/studio/clients/write-credential/route";
import { POST as registerInterface } from "@/app/api/studio/interfaces/route";
import {
  ClientCredentials,
  writeKeyAction,
  type CredentialSolution,
  type CredentialSummary,
} from "@/components/studio/ClientCredentials";

const RUN = `p03wk-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 24 * 60 * 60 * 1000;

const user = (name: string) => ({
  id: `${RUN}-${name}`,
  email: `${RUN}-${name}@abeam.com`,
  name,
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
});
const DEVELOPER = user("dev");
const BUSINESS = user("biz");
const SUPPORT = user("sup");
/** The support owner of the third app, who leaves. */
const LEAVER = user("leaver");
/** Owns nothing: approves the write grants and issues the keys. */
const COLLEAGUE = user("colleague");
const PEOPLE = [DEVELOPER, BUSINESS, SUPPORT, LEAVER, COLLEAGUE];

function req(value: unknown, method = "POST") {
  return new NextRequest("http://localhost/api/studio", {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  });
}

async function ok<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: unknown };
  expect([200, 201], JSON.stringify(json)).toContain(res.status);
  return json.data as T;
}

/** An app with a live DEV credential and an approved DEV CREATE grant, through the routes. */
async function appReadyForWriteKey(slug: string, supportOwnerId: string): Promise<string> {
  const { id: solutionId } = await prisma.solution.create({
    data: {
      organizationId: ORG,
      name: slug,
      slug: `${RUN}-${slug}`,
      classification: "CLIENT_APP",
      businessProblem: "Raises purchase orders from the supplier portal.",
      dataClass: "INTERNAL",
      status: "ACTIVE",
      technicalOwnerId: DEVELOPER.id,
      businessOwnerId: BUSINESS.id,
      supportOwnerId,
    },
    select: { id: true },
  });
  session.user = DEVELOPER;
  const iface = await ok<{ id: string }>(
    await registerInterface(
      req({
        solutionId,
        name: `${slug} create`,
        sapProduct: "s4hana",
        externalId: `${slug}-orders`,
        operation: "CREATE",
        entitySet: "A_PurchaseOrder",
      }),
    ),
  );
  const grant = await ok<{ id: string }>(
    await requestGrant(
      req({
        solutionId,
        interfaceId: iface.id,
        externalId: `${slug}-orders`,
        operation: "CREATE",
        environment: "DEV",
        justification: "The portal raises purchase orders in DEV for the pilot.",
        expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
      }),
    ),
  );
  session.user = COLLEAGUE;
  await ok(await decideGrant(req({ grantId: grant.id, decision: "APPROVED", writeChecklistAcknowledged: true }, "PATCH")));
  await ok(await issueKey(req({ solutionId, environment: "DEV", label: `${slug} · DEV` })));
  return solutionId;
}

/** The props the page hands the Runtime credentials panel. */
function credentialsPanel(node: unknown): { credentials: CredentialSummary[]; solutions: CredentialSolution[] } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = credentialsPanel(child);
      if (found) return found;
    }
    return null;
  }
  if (node === null || typeof node !== "object" || !("props" in node)) return null;
  const element = node as ReactElement<{ children?: unknown; credentials: CredentialSummary[]; solutions: CredentialSolution[] }>;
  if (element.type === ClientCredentials) return element.props;
  return credentialsPanel(element.props.children);
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("API Access · the write-key row agrees with the route (P0.3 review round 2)", () => {
  const apps: Record<"complete" | "retired" | "ownerLeft", string> = { complete: "", retired: "", ownerLeft: "" };

  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "e".repeat(64));
    await prisma.organization.create({ data: { id: ORG, name: "Write key row", type: "client" } });
    for (const u of PEOPLE) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
    apps.complete = await appReadyForWriteKey("complete", SUPPORT.id);
    apps.retired = await appReadyForWriteKey("retired", SUPPORT.id);
    apps.ownerLeft = await appReadyForWriteKey("owner-left", LEAVER.id);

    // Retiring leaves the app's credentials live; the owner leaving leaves their id in the slot.
    await prisma.solution.update({ where: { id: apps.retired, organizationId: ORG }, data: { status: "RETIRED" } });
    await prisma.user.update({ where: { id: LEAVER.id }, data: { isActive: false } });
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: PEOPLE.map((u) => u.id) } } });
  });

  it("offers the action only where the route issues the key, and gives the route's reason where it refuses", async () => {
    session.user = COLLEAGUE;
    const panel = credentialsPanel(await StudioAccessPage());
    expect(panel, "the page renders the Runtime credentials panel").not.toBeNull();
    const rows = panel!.credentials;
    expect(rows.map((r) => r.solutionId).sort()).toEqual(Object.values(apps).sort());

    const expected: Record<string, { enabled: boolean; reason?: RegExp; refusal?: RegExp }> = {
      [apps.complete]: { enabled: true },
      [apps.retired]: { enabled: false, reason: /retired/i, refusal: /RETIRED/ },
      [apps.ownerLeft]: { enabled: false, reason: /no live support owner/, refusal: /no support owner/ },
    };

    for (const row of rows) {
      const viewerOwns = panel!.solutions.find((s) => s.id === row.solutionId)?.viewerOwns ?? false;
      const action = writeKeyAction(row, viewerOwns);
      const want = expected[row.solutionId]!;
      expect(action.enabled, `${row.solutionName}: ${action.reason ?? "enabled"}`).toBe(want.enabled);

      const res = await issueWriteKey(req({ solutionId: row.solutionId, environment: row.environment }));
      const body = (await res.json()) as { error?: { message: string } };
      if (action.enabled) {
        expect(res.status, JSON.stringify(body)).toBe(201);
      } else {
        expect(action.reason).toMatch(want.reason!);
        expect(res.status).toBe(403);
        expect(body.error?.message).toMatch(want.refusal!);
      }
    }
  });
});
