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
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { BudgetExceeded, jsonBytesUpTo, kitLimit, LIMITS, OutputBudget } from "@/lib/contracts/budget";
import { documentOutputTooLargeMessage, documentTooLargeMessage, loadDocInputs } from "@/lib/contracts/doc-inputs";
import { prisma } from "@/lib/db/prisma";
import { UNVERSIONED_BASE_PATH } from "@/lib/northbound/version-policy";
import { studioError, studioOk } from "@/lib/studio/api";
import { partitionFixtures, withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { servedFixtures } from "@/lib/studio/fixtures";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { capturedSchemaFacts, readCurrentCapturedSchemas } from "@/lib/studio/response-schema-states";
import { buildScaffold } from "@/lib/studio/scaffold";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

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

  const inputs = await loadDocInputs(tenantScopeOf(organizationId), [iface]);
  if (!inputs.ok) return studioError("TOO_LARGE", documentTooLargeMessage("starter kit", inputs.limit));
  const compiled = inputs.compiled.get(iface.id);

  // The base URL the generated client will call. Derived from the request so the
  // artifact works against whatever host the developer is actually using, on
  // the original path: every deployment serves it, including the one an
  // Instant Rollback returns to, which does not serve /v1 (P1 wave A review;
  // DEFAULT_KIT_BASE_URL). The kit's OpenAPI lists v1 as the second server.
  const baseUrl = `${request.nextUrl.origin}${UNVERSIONED_BASE_PATH}`;

  // Recorded responses, so the kit runs offline. Absent → it still ships, and
  // the README says which scenarios are missing rather than pretending the mock
  // is complete.
  const fixtureRows = await prisma.mockFixture.findMany({
    where: { organizationId, interfaceId: iface.id },
    select: {
      scenario: true,
      status: true,
      body: true,
      sourceStatus: true,
      capturedAt: true,
      interfaceVersion: true,
      entitySet: true,
    },
    orderBy: { scenario: "asc" },
  });

  const facts = (await capturedSchemaFacts(organizationId, [iface])).get(iface.id) ?? { state: "none" as const, storedBytes: null };
  const schemaState = facts.state;
  const captured =
    schemaState === "current"
      ? ((await readCurrentCapturedSchemas(organizationId, [iface], new Map([[iface.id, facts]]))).get(iface.id) ?? null)
      : null;
  // As stored, as the kit has always been given it: scaffold.ts serves it as the broker serves rows.
  const responseSchema = captured?.ok ? captured.stored : undefined;
  // This contract's recordings only; then each as the broker would answer it,
  // one per scenario (fixtures.ts, A57).
  const partitioned = partitionFixtures(
    fixtureRows.map((f) => ({ ...f, capturedAt: f.capturedAt.toISOString() })),
    iface,
  );
  const fixtures = servedFixtures(partitioned.current);
  const { withheld } = partitioned;

  /*
   * UNDER THE KIT'S BUDGET (budget.ts, kitLimit): a function of what was
   * stored — the compiled contract's kept size, or the captured schema's,
   * and the recorded fixtures' — never of what rendering it turns out to
   * cost. Every file is charged as it is written and the kit stops at the
   * budget (TOO_LARGE). The record rendered the same contract under the same
   * budget in the compiler's envelope (pipeline.ts) before storing it.
   */
  const contractBytes =
    compiled?.irBytes ?? (responseSchema !== undefined ? jsonBytesUpTo(responseSchema, LIMITS.kit.cap) : 0);
  let fixtureBytes = 0;
  for (const f of fixtures) fixtureBytes += jsonBytesUpTo(f.body, LIMITS.kit.cap);
  const budget = new OutputBudget("kit", kitLimit(contractBytes, fixtureBytes));

  let files: ReturnType<typeof buildScaffold>;
  try {
    files = buildScaffold(
      {
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
        grants: inputs.grants.get(iface.id) ?? [],
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
      fixtures.map((f) => ({
        scenario: f.scenario,
        status: f.status,
        body: f.body,
        sourceStatus: f.sourceStatus,
        capturedAt: f.capturedAt,
      })),
      withheld.map((w) => ({ scenario: w.scenario, reason: withheldArtifactNote(w.state, iface) })),
      budget,
    );
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return studioError("TOO_LARGE", documentOutputTooLargeMessage("starter kit", budget.limit));
  }

  return studioOk({ files });
}
