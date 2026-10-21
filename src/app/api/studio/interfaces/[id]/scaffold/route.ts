/**
 * GET /api/studio/interfaces/[id]/scaffold — download the scaffold artifacts.
 *
 * Returns plain files as JSON so the browser can offer each as a download. No
 * archive library is pulled in for four small text files, and no in-browser
 * editor exists — this is code you take to YOUR repository.
 *
 * The artifacts are rendered from the interface's governed configuration by pure
 * functions in lib/studio/scaffold.ts, which is where they are tested.
 *
 * ONLY THIS CONTRACT'S CAPTURES (P0.4, A38). The schema and the fixtures go in
 * only when their stamp matches the interface's current version and entity
 * set; anything else is named in the kit as withheld, with the reason, and
 * never served by its mock (contract-provenance.ts).
 *
 * THE COMPILED CONTRACT (P1.3). When a verify has recorded a contract that
 * describes the interface now, the kit's openapi.json, openapi-3.0.json and
 * client.ts are built from it; the approved grants bound to the interface are
 * noted in the documents. Read from the snapshot — nothing is compiled here.
 * What it carries is bounded like the solution document (doc-inputs.ts):
 * past the budget the answer is TOO_LARGE, before any IR is read.
 *
 * And the captured schema is read only when its stored size is inside the
 * captured-schema bound (response-schema-states.ts, structural hardening
 * round 1); past it the kit says it was set aside, and why.
 *
 * RENDERED OFF THE REQUEST THREAD WHEN IT IS LARGE (structural hardening
 * rounds 2 and 3). A kit inside its 32 MiB budget took a second or more to
 * build, on this thread, on every download. It is built by
 * renderReadPathLazy (read-render.ts): here while its stored input is small
 * and the thread's share of render time allows, in the compiler's envelope
 * otherwise — and there its contract, captured schema and fixture bodies are
 * read only once it holds a render slot. Its files' JSON is sent as the
 * envelope wrote it, as bytes.
 *
 * FIXTURES BY SIZE FIRST (round 3): their stored sizes are read before their
 * bodies, and a kit carries at most LIMITS.fixture.storedTextBytes of them;
 * the rest are named in the kit as withheld, too large (fixture-store.ts).
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { jsonBytesUpTo, kitLimit, LIMITS } from "@/lib/contracts/budget";
import {
  documentInputTooLargeMessage,
  documentOutputTooLargeMessage,
  documentTooLargeMessage,
  documentUnavailableMessage,
  fixtureTooLargeNote,
  loadDocContracts,
  planDocInputs,
} from "@/lib/contracts/doc-inputs";
import { prisma } from "@/lib/db/prisma";
import { UNVERSIONED_BASE_PATH } from "@/lib/northbound/version-policy";
import { studioError, studioOkJson } from "@/lib/studio/api";
import { partitionFixtures, withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { fixtureBodies, fixtureFacts, fixturesWithinBound } from "@/lib/studio/fixture-store";
import { servedFixtures } from "@/lib/studio/fixtures";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { capturedSchemaFacts, capturedSchemaReadable, readCurrentCapturedSchemas } from "@/lib/studio/response-schema-states";
import { RawJson, renderReadPathLazy, type ReadLoad } from "@/lib/contracts/read-render";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/** A large kit renders in a worker thread (lib/contracts/read-render.ts): Node.js only. */
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioError("FORBIDDEN", "No organization scope.");

  const { id } = await ctx.params;

  const iface = await prisma.interface.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      name: true,
      externalId: true,
      sapProduct: true,
      operation: true,
      entitySet: true,
      version: true,
      mode: true,
      status: true,
      // Not responseSchema: read below only when it is inside its bound.
      solution: { select: { name: true } },
    },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const scope = tenantScopeOf(organizationId);
  // What is known before anything large is read: the contract's kept size (and the grants).
  const plan = await planDocInputs(scope, [iface]);
  if (!plan.ok) return studioError("TOO_LARGE", documentTooLargeMessage("starter kit", plan.limit));

  // The base URL the generated client will call. Derived from the request so the
  // artifact works against whatever host the developer is actually using, on
  // the original path: every deployment serves it, including the one an
  // Instant Rollback returns to, which does not serve /v1 (P1 wave A review;
  // DEFAULT_KIT_BASE_URL). The kit's OpenAPI lists v1 as the second server.
  const baseUrl = `${request.nextUrl.origin}${UNVERSIONED_BASE_PATH}`;

  /*
   * Recorded responses, so the kit runs offline. Absent → it still ships, and
   * the README says which scenarios are missing rather than pretending the
   * mock is complete. Their stamps and stored sizes first, with no body
   * (fixture-store.ts, structural hardening round 3): only this contract's
   * recordings (A38), and of those only what fits the fixtures a kit carries
   * (LIMITS.fixture) — the rest are named as withheld, too large, and their
   * bodies are never read.
   */
  const partitioned = partitionFixtures(
    (await fixtureFacts(organizationId, iface.id)).map((f) => ({ ...f, capturedAt: f.capturedAt.toISOString() })),
    iface,
  );
  const sized = fixturesWithinBound(partitioned.current);
  const withheld = [
    ...partitioned.withheld.map((w) => ({ scenario: w.scenario, reason: withheldArtifactNote(w.state, iface) })),
    ...sized.tooLarge.map((f) => ({ scenario: f.scenario, reason: fixtureTooLargeNote(LIMITS.fixture.storedTextBytes), tooLarge: true })),
  ];
  const fixtureBytes = sized.kept.reduce((n, f) => n + f.bytes, 0);

  const facts = (await capturedSchemaFacts(organizationId, [iface])).get(iface.id) ?? { state: "none" as const, storedBytes: null };
  const schemaState = facts.state;
  const contractBytes = plan.contractBytes;
  const capturedBytes = schemaState === "current" && capturedSchemaReadable(facts.storedBytes) ? (facts.storedBytes ?? 0) : 0;

  /*
   * UNDER THE KIT'S BUDGET (budget.ts, kitLimit): a function of what was
   * stored — the compiled contract's kept size, or the captured schema's,
   * and the recorded fixtures' — never of what rendering it turns out to
   * cost. Every file is charged as it is written and the kit stops at the
   * budget (TOO_LARGE). The record rendered the same contract under the same
   * budget in the compiler's envelope (pipeline.ts) before storing it.
   *
   * WHAT IS LOADED, IS LOADED ONLY WHEN IT IS ITS TURN (read-render.ts,
   * structural hardening round 3): the contract's IR, the captured schema and
   * the fixtures' bodies are read by the loader below, which runs on this
   * thread for a small kit and, for a large one, only once it holds a render
   * slot — a download refused for want of one has read none of them.
   */
  let limit = 0;
  const rendered = await renderReadPathLazy(
    { inputBytes: contractBytes === null ? null : contractBytes + capturedBytes + fixtureBytes },
    async (): Promise<ReadLoad<number>> => {
      const contracts = await loadDocContracts(scope, plan);
      if (!contracts.ok) return { ok: false, refusal: contracts.limit };
      const compiled = contracts.compiled.get(iface.id);
      const captured =
        schemaState === "current"
          ? ((await readCurrentCapturedSchemas(organizationId, [iface], new Map([[iface.id, facts]]))).get(iface.id) ?? null)
          : null;
      // As stored, as the kit has always been given it: scaffold.ts serves it as the broker serves rows.
      const responseSchema = captured?.ok ? captured.stored : undefined;
      const bodies = await fixtureBodies(
        organizationId,
        iface.id,
        sized.kept.map((f) => f.id),
      );
      // Each as the broker would answer it, one per scenario (fixtures.ts, A57).
      const fixtures = servedFixtures(
        sized.kept.filter((f) => bodies.has(f.id)).map((f) => ({ ...f, body: bodies.get(f.id) })),
      );
      limit = kitLimit(
        compiled?.irBytes ?? (responseSchema !== undefined ? jsonBytesUpTo(responseSchema, LIMITS.kit.cap) : 0),
        fixtureBytes,
      );
      return {
        ok: true,
        input: {
          path: "kit",
          iface: {
            id: iface.id,
            name: iface.name,
            externalId: iface.externalId,
            sapProduct: iface.sapProduct,
            operation: iface.operation,
            entitySet: iface.entitySet,
            version: iface.version,
            mode: iface.mode,
            status: iface.status,
            solutionName: iface.solution.name,
            ...(compiled ? { compiled } : {}),
            grants: plan.grants.get(iface.id) ?? [],
            // Present → the contract describes real fields. Absent → it says so,
            // and says why when a stored schema of another contract was set aside.
            ...(responseSchema !== undefined ? { responseSchema } : {}),
            ...(schemaState === "stale" || schemaState === "unverified"
              ? { withheldSchemaNote: withheldArtifactNote(schemaState, iface) }
              : captured && !captured.ok
                ? {
                    withheldSchemaNote: `The captured schema is larger than a captured schema may be (${LIMITS.capturedSchema.properties.toLocaleString("en")} fields, ${LIMITS.capturedSchema.bytes / 1024} KB), so it is not included. Run the interface in the Test Console and capture again, or verify the service to compile its contract.`,
                  }
                : {}),
          },
          baseUrl,
          fixtures: fixtures.map((f) => ({
            scenario: f.scenario,
            status: f.status,
            body: f.body,
            sourceStatus: f.sourceStatus,
            capturedAt: f.capturedAt,
          })),
          withheld,
          limit,
        },
      };
    },
    { tenant: organizationId },
  );
  if (!rendered.ok) {
    switch (rendered.reason) {
      case "REFUSED":
        return studioError("TOO_LARGE", documentTooLargeMessage("starter kit", rendered.refusal));
      case "TOO_LARGE":
        return studioError("TOO_LARGE", documentOutputTooLargeMessage("starter kit", limit));
      case "INPUT_TOO_LARGE":
        return studioError("TOO_LARGE", documentInputTooLargeMessage("starter kit", LIMITS.renderInput.bytes));
      case "UNAVAILABLE":
        return studioError("UNAVAILABLE", documentUnavailableMessage("starter kit"));
    }
  }

  // As studioOk sends it, with the files' JSON spliced in as it was written (RawJson).
  const raw = new RawJson();
  return studioOkJson(raw.bytes({ data: { files: raw.slot(rendered.texts[0]!) } }));
}
