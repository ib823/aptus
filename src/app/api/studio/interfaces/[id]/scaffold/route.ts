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
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { loadDocInputs } from "@/lib/contracts/doc-inputs";
import { prisma } from "@/lib/db/prisma";
import { V1_BASE_PATH } from "@/lib/northbound/version-policy";
import { studioError, studioOk } from "@/lib/studio/api";
import {
  partitionFixtures,
  responseSchemaState,
  withheldArtifactNote,
} from "@/lib/studio/contract-provenance";
import { servedFixtures } from "@/lib/studio/fixtures";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
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
      responseSchema: true,
      solution: { select: { name: true } },
    },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  const inputs = await loadDocInputs(tenantScopeOf(organizationId), [iface]);
  const compiled = inputs.compiled.get(iface.id);

  // The base URL the generated client will call. Derived from the request so the
  // artifact works against whatever host the developer is actually using, on
  // the versioned path new code is told to use (P1.10). The original path is
  // the same implementation: kits downloaded before keep working on it, and
  // the kit's OpenAPI lists it as the second server.
  const baseUrl = `${request.nextUrl.origin}${V1_BASE_PATH}`;

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

  const schemaState = responseSchemaState(iface.responseSchema, iface);
  // This contract's recordings only; then each as the broker would answer it,
  // one per scenario (fixtures.ts, A57).
  const partitioned = partitionFixtures(
    fixtureRows.map((f) => ({ ...f, capturedAt: f.capturedAt.toISOString() })),
    iface,
  );
  const fixtures = servedFixtures(partitioned.current);
  const { withheld } = partitioned;

  const files = buildScaffold(
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
      ...(schemaState === "current" ? { responseSchema: iface.responseSchema } : {}),
      ...(schemaState === "stale" || schemaState === "unverified"
        ? { withheldSchemaNote: withheldArtifactNote(schemaState, iface) }
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
  );

  return studioOk({ files });
}
