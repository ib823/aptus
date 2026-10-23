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
 * RENDERED IN THE CONTRACT COMPILER'S WORKER, NEVER HERE (P1.3). A kit
 * inside its 32 MiB budget takes a second or more to build. It is a builder's
 * download, so it is built by a render job (envelope.ts) through the
 * compiler's one fair gate, charged to the downloading organisation's daily
 * compiler time: its contract, captured schema and fixture bodies are read
 * only once the job holds its slot, and its files' JSON is sent as the
 * worker wrote it, as bytes. Busy: 503, retry in seconds; the organisation's
 * time spent: 429 until 00:00 UTC.
 *
 * FIXTURES BY SIZE FIRST (round 3): their stored sizes are read before their
 * bodies, and a kit carries at most LIMITS.fixture.storedTextBytes of them;
 * the rest are named in the kit as withheld, too large (fixture-store.ts).
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { jsonBytesUpTo, kitLimit, LIMITS } from "@/lib/contracts/budget";
import {
  documentTooLargeMessage,
  STUDIO_JOB_DEADLINE_MS,
  downloadRefusal,
  fixtureTooLargeNote,
  loadDocContracts,
  planDocInputs,
} from "@/lib/contracts/doc-inputs";
import { runContractJob } from "@/lib/contracts/envelope";
import { prisma } from "@/lib/db/prisma";
import { UNVERSIONED_BASE_PATH } from "@/lib/northbound/version-policy";
import { studioError, studioOkJson } from "@/lib/studio/api";
import { partitionFixtures, withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { fixtureBodies, fixtureFacts, fixturesWithinBound } from "@/lib/studio/fixture-store";
import { servedFixtures } from "@/lib/studio/fixtures";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { capturedSchemaFacts, readCurrentCapturedSchemas } from "@/lib/studio/response-schema-states";
import { RawJson } from "@/lib/contracts/raw-json";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/** The kit renders in a worker thread (lib/contracts/envelope.ts): Node.js only. */
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deadlineAt = Date.now() + STUDIO_JOB_DEADLINE_MS;
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
      // The compiled query policy (P1.4): at most 64 KiB, held at its one writer.
      queryPolicyCompiled: true,
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

  /*
   * UNDER THE KIT'S BUDGET (budget.ts, kitLimit): a function of what was
   * stored — the compiled contract's kept size, or the captured schema's,
   * and the recorded fixtures' — never of what rendering it turns out to
   * cost. Every file is charged as it is written and the kit stops at the
   * budget (TOO_LARGE).
   *
   * LOADED ONLY ONCE IT HOLDS ITS SLOT (envelope.ts): the contract's IR, the
   * captured schema and the fixtures' bodies are read by the loader below,
   * so a download refused or still waiting has read none of them.
   */
  let limit = 0;
  let refused: number | null = null;
  const rendered = await runContractJob(
    "render",
    async () => {
      const contracts = await loadDocContracts(scope, plan);
      if (!contracts.ok) {
        refused = contracts.limit;
        return null;
      }
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
      // Each as the broker would answer it, one per scenario (fixtures.ts, A57); a body is its stored text until the kit renders.
      const fixtures = servedFixtures(
        sized.kept.filter((f) => bodies.has(f.id)).map((f) => ({ ...f, body: bodies.get(f.id) })),
      );
      /*
       * BUDGETED BY WHAT IT RENDERS (structural hardening round 5), as the
       * solution document is: the compiled contract's kept size only when the
       * kit renders it (a METADATA contract, scaffold.ts); otherwise the
       * captured schema the kit renders. A stale SAMPLED snapshot — 696
       * bytes, from an earlier narrow capture whose successor was never
       * recorded — budgeted a kit built from a 2,000-field capture at a
       * third of its size, and refused it TOO_LARGE while /schema and the
       * solution document served the same capture.
       */
      const rendersCompiled = compiled !== undefined && compiled.source === "METADATA";
      limit = kitLimit(
        (rendersCompiled
          ? compiled.irBytes
          : Math.max(compiled?.irBytes ?? 0, responseSchema !== undefined ? jsonBytesUpTo(responseSchema, LIMITS.kit.cap) : 0)) +
          // The query parameters openapi.json lists are written from the policy (P1.4).
          (iface.queryPolicyCompiled === null ? 0 : jsonBytesUpTo(iface.queryPolicyCompiled, LIMITS.queryPolicyCompiled.bytes)),
        fixtureBytes,
      );
      return {
        kind: "render",
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
            ...(iface.queryPolicyCompiled === null ? {} : { queryPolicy: iface.queryPolicyCompiled }),
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
    { tenant: organizationId, deadlineAt },
  );
  if (rendered === null) return studioError("TOO_LARGE", documentTooLargeMessage("starter kit", refused ?? plan.limit));
  if (!rendered.ok) return downloadRefusal("starter kit", rendered, limit);
  if (!rendered.value.ok) return downloadRefusal("starter kit", { reason: "RESOURCE_LIMIT", detail: "" }, rendered.value.limit);

  // As studioOk sends it, with the files' JSON spliced in as it was written (RawJson).
  const raw = new RawJson();
  return studioOkJson(raw.bytes({ data: { files: raw.slot(rendered.value.text) } }));
}
