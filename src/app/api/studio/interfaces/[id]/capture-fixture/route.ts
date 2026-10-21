/**
 * POST /api/studio/interfaces/[id]/capture-fixture
 *
 * Records what a run actually returned, so a developer's own test suite can
 * replay it offline. The run already happened in the Test Console, so this costs
 * no additional SAP call.
 *
 * One fixture per (interface, scenario): re-capturing REPLACES rather than
 * accumulating, because a pile of near-identical recordings is not a richer
 * fixture set, it is just a question about which one is current.
 *
 * Records are truncated to a small sample. A fixture is an example, not a data
 * export — shipping a thousand rows of a client's business data inside a starter
 * kit would be a leak dressed up as a convenience.
 *
 * THE BROKER'S OUTCOME DECIDES THE SCENARIO (P0.4, A57). The console sends the
 * run's broker status (`readStatus`), and the scenario, status and error code
 * follow from it through the broker's own tables (fixtures.ts), so a run the
 * broker answers 404 NOT_FOUND is recorded as 404 NOT_FOUND — not as the 502
 * UPSTREAM_ERROR it used to become. A console open across the deploy sends
 * the older `honestStatus`, which is still read.
 *
 * STAMPED WITH THE CONTRACT (P0.4, A38): the interface version and entity set
 * it was recorded under. The starter kit ships only fixtures whose stamp still
 * matches; a capture from a run of an earlier contract is refused with 409.
 */

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { LIMITS } from "@/lib/contracts/budget";
import { JSON_TEXT_PLACEHOLDER, writeWithJsonText } from "@/lib/db/json-text";
import { prisma } from "@/lib/db/prisma";
import { readJsonCapped } from "@/lib/security/bounded-body";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { captureContractMismatch } from "@/lib/studio/contract-provenance";
import {
  buildFixtureBody,
  isFixtureScenario,
  isReadStatus,
  SCENARIO_STATUS,
  scenarioForOutcome,
  scenarioForReadStatus,
} from "@/lib/studio/fixtures";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * A FIXTURE IS BOUNDED IN BYTES, NOT ONLY IN ROWS (structural hardening
 * round 3). Twenty-five rows can be any width — base64 photos, long texts —
 * and this route read its body with no bound and stored whatever it was
 * given, so one recording of tens of MB was loaded whole by every kit
 * download that followed. The request body is read up to
 * LIMITS.fixture.requestBytes and no further, and the body stored is at most
 * LIMITS.fixture.bytes of compact JSON; the kit reads fixtures by size first
 * (fixture-store.ts).
 */
const FIXTURE_TOO_LARGE_MESSAGE = `This recording is larger than a fixture may be (${LIMITS.fixture.bytes / (1024 * 1024)} MB), so it was not stored. Run the interface with fewer or narrower rows (a $select of the fields your tests need), and capture again.`;

const bodySchema = z.object({
  /** The broker's read outcome for the run (NorthboundReadStatus). Preferred. */
  readStatus: z.string().min(1).optional(),
  /** The honest status the run reported — what a console from before readStatus sends. */
  honestStatus: z.string().min(1).optional(),
  /**
   * The broker's sentence for the run (`note` on broker-run), served as the
   * fixture's error message. The code is never the caller's: it is the
   * broker's code for the outcome.
   */
  detail: z.string().max(2000).optional(),
  /** The contract the run was against, as broker-run reported it. */
  interfaceVersion: z.number().int().min(1).optional(),
  entitySet: z.string().max(200).nullable().optional(),
  /**
   * The status the TENANT returned on that run.
   *
   * Optional because an older client will not send it, and rejecting those
   * would break capture rather than improve it. What it must never do is
   * DEFAULT: an absent value is recorded as null, meaning "this fixture cannot
   * prove where it came from", which is a different claim from 200.
   */
  sourceStatus: z.number().int().min(100).max(599).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (!canMutateStudio(user.role)) {
    return studioError("FORBIDDEN", "Your role can view interfaces but not capture fixtures.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");

  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  // Bounded before it is parsed (bounded-body.ts): a self-hosted deployment has no platform limit.
  const raw = await readJsonCapped(request, LIMITS.fixture.requestBytes);
  if (!raw.ok && raw.reason === "TOO_LARGE") return studioError("TOO_LARGE", FIXTURE_TOO_LARGE_MESSAGE);
  const parsed = bodySchema.safeParse(raw.ok ? raw.value : null);
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid fixture payload.");

  const { readStatus, honestStatus } = parsed.data;
  const scenario =
    readStatus !== undefined
      ? isReadStatus(readStatus)
        ? scenarioForReadStatus(readStatus, parsed.data.rows.length)
        : null
      : honestStatus !== undefined
        ? scenarioForOutcome(honestStatus, parsed.data.rows.length, parsed.data.sourceStatus)
        : null;
  if (!scenario || !isFixtureScenario(scenario)) {
    // A run that failed for a local reason teaches a consumer nothing about how
    // the tenant behaves, so there is nothing worth recording.
    return studioError("VALIDATION_ERROR", "That outcome is not a recordable scenario.");
  }

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: { id: true, name: true, version: true, entitySet: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const mismatch = captureContractMismatch(parsed.data, iface);
  if (mismatch) return studioError("CONFLICT", mismatch);
  const stamp = { interfaceVersion: iface.version, entitySet: iface.entitySet };

  const body = buildFixtureBody(scenario, parsed.data.rows, parsed.data.detail);
  /*
   * WRITTEN AS ITS TEXT (structural hardening round 5, json-text.ts). The
   * body is bounded (LIMITS.fixture) and was stored through Prisma, which
   * serialises a Json value node by node on this thread: a body at the
   * bound blocked every tenant's requests for 1.4-1.7 s per capture. Now it
   * is written once, by the native JSON writer — the body came from a
   * request read up to LIMITS.fixture.requestBytes, so the text is bounded
   * by construction — measured as that text, and stored as it is.
   */
  const bodyText = JSON.stringify(body);
  if (Buffer.byteLength(bodyText, "utf8") > LIMITS.fixture.bytes) return studioError("TOO_LARGE", FIXTURE_TOO_LARGE_MESSAGE);
  const status = SCENARIO_STATUS[scenario];

  // Replace any existing recording of this scenario — see the header.
  const existing = await prisma.mockFixture.findFirst({
    where: { organizationId: scope.organizationId, interfaceId: iface.id, scenario },
    select: { id: true },
  });

  const select = { id: true, scenario: true, status: true, sourceStatus: true, capturedAt: true } as const;
  // The row through Prisma with a placeholder body, and the body from its text, in one transaction (json-text.ts).
  const saved = existing
    ? await writeWithJsonText("MockFixture", scope.organizationId, { body: bodyText }, (tx) =>
        tx.mockFixture.update({
          where: { id: existing.id, organizationId: scope.organizationId },
          // sourceStatus is written on every replace, including back to null when
          // the caller did not send one. A stale provenance stamp left over from a
          // previous capture would be worse than none: it would evidence a run
          // that is no longer the one stored here.
          data: {
            status,
            body: JSON_TEXT_PLACEHOLDER,
            sourceStatus: parsed.data.sourceStatus ?? null,
            capturedAt: new Date(),
            ...stamp,
          },
          select,
        }),
      ).catch(vanishedAsNull)
    : await writeWithJsonText("MockFixture", scope.organizationId, { body: bodyText }, (tx) =>
        tx.mockFixture.create({
          data: {
            organizationId: scope.organizationId,
            interfaceId: iface.id,
            scenario,
            status,
            body: JSON_TEXT_PLACEHOLDER,
            sourceStatus: parsed.data.sourceStatus ?? null,
            ...stamp,
          },
          select,
        }),
      );
  if (!saved) {
    // The recording found above was deleted before it could be replaced: a
    // Studio PATCH that changes the contract deletes every fixture of the
    // interface in the same transaction as the version bump. It is the race
    // capture-schema reports as 409, and these rows belong to the old contract.
    return studioError(
      "CONFLICT",
      "This interface's contract changed while the fixture was being captured. Run it again and capture from the new run.",
    );
  }

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    action: "UPDATE",
    after: { event: "mock_fixture_captured", scenario, status, rows: body.records?.length ?? 0, ...stamp },
  });

  return studioOk({
    id: saved.id,
    scenario: saved.scenario,
    status: saved.status,
    rows: body.records?.length ?? 0,
    replaced: Boolean(existing),
  });
}

/** An update whose row is gone (Prisma P2025) reads as null; anything else still throws. */
function vanishedAsNull(err: unknown): null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
  throw err;
}
