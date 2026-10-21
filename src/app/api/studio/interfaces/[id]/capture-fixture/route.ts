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
 *
 * PARSED ONLY IN THE CONTRACT COMPILER'S WORKER (P1.3). Twenty-five rows can
 * be any width — base64 photos, long texts — and they come from the tenant's
 * SAP system. The request body is read as text up to
 * LIMITS.fixture.requestBytes and no further; a fixture job (jobs.ts) —
 * through the compiler's one fair gate, charged to the organisation's daily
 * compiler time — parses and validates it, decides the scenario, strips the
 * OData envelope, and sends back the compact body (at most
 * LIMITS.fixture.bytes), which is stored from its text (json-text.ts). The
 * kit reads fixtures by size first (fixture-store.ts). A capture the compiler
 * could not take (busy, its time spent) stores nothing and says so.
 */

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { LIMITS } from "@/lib/contracts/budget";
import { jobRefusal, STUDIO_JOB_DEADLINE_MS } from "@/lib/contracts/doc-inputs";
import { runJobInEnvelope } from "@/lib/contracts/envelope";
import { textOf } from "@/lib/contracts/jobs";
import { JSON_TEXT_PLACEHOLDER, writeWithJsonText } from "@/lib/db/json-text";
import { prisma } from "@/lib/db/prisma";
import { readTextCapped } from "@/lib/security/bounded-body";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { captureContractMismatch } from "@/lib/studio/contract-provenance";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/** The fixture is parsed in a worker thread (lib/contracts/envelope.ts): Node.js only. */
export const runtime = "nodejs";

/** A fixture is bounded in bytes, not only in rows: the request body and the body stored (LIMITS.fixture). */
const FIXTURE_TOO_LARGE_MESSAGE = `This recording is larger than a fixture may be (${LIMITS.fixture.bytes / (1024 * 1024)} MB), so it was not stored. Run the interface with fewer or narrower rows (a $select of the fields your tests need), and capture again.`;

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

  const deadlineAt = Date.now() + STUDIO_JOB_DEADLINE_MS;
  // Bounded, and never parsed here (bounded-body.ts): the fixture job parses it.
  const raw = await readTextCapped(request, LIMITS.fixture.requestBytes);
  if (!raw.ok && raw.reason === "TOO_LARGE") return studioError("TOO_LARGE", FIXTURE_TOO_LARGE_MESSAGE);
  if (!raw.ok) return studioError("VALIDATION_ERROR", "Invalid fixture payload.");

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, id),
    select: { id: true, name: true, version: true, entitySet: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const job = await runJobInEnvelope({ kind: "fixture", input: { body: raw.text } }, { tenant: scope.organizationId, deadlineAt });
  if (!job.ok) return jobRefusal("The fixture was not captured", job) ?? studioError("TOO_LARGE", FIXTURE_TOO_LARGE_MESSAGE);
  const fixture = job.value;
  if (!fixture.ok) {
    return fixture.reason === "TOO_LARGE"
      ? studioError("TOO_LARGE", FIXTURE_TOO_LARGE_MESSAGE)
      : fixture.reason === "NOT_RECORDABLE"
        ? // A run that failed for a local reason teaches a consumer nothing about how the tenant behaves.
          studioError("VALIDATION_ERROR", "That outcome is not a recordable scenario.")
        : studioError("VALIDATION_ERROR", "Invalid fixture payload.");
  }

  const mismatch = captureContractMismatch(fixture.claimed, iface);
  if (mismatch) return studioError("CONFLICT", mismatch);
  const stamp = { interfaceVersion: iface.version, entitySet: iface.entitySet };
  const { scenario, status } = fixture;
  // Written as its text, as the job wrote it (json-text.ts): PostgreSQL parses it, this thread copies a string.
  const bodyText = textOf(fixture.body);

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
            sourceStatus: fixture.sourceStatus,
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
            sourceStatus: fixture.sourceStatus,
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
    after: { event: "mock_fixture_captured", scenario, status, rows: fixture.rows, ...stamp },
  });

  return studioOk({
    id: saved.id,
    scenario: saved.scenario,
    status: saved.status,
    rows: fixture.rows,
    replaced: Boolean(existing),
  });
}

/** An update whose row is gone (Prisma P2025) reads as null; anything else still throws. */
function vanishedAsNull(err: unknown): null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
  throw err;
}
