/**
 * GET /api/studio/solutions/[id]/openapi — the solution's northbound OpenAPI
 * (P1.3).
 *
 *   ?version=3.1 (default) → OpenAPI 3.1.0
 *   ?version=3.0           → OpenAPI 3.0.3, for generators that do not read 3.1
 *
 * One document for every interface of the solution: each interface's served
 * operation, every header and error the broker sends, the discovery route,
 * and each interface's contract compiled from its service's description
 * (or sampled rows, or stated as unknown) — the per-interface kit's
 * openapi.json, for the whole solution a credential is issued for.
 *
 * Studio-gated like the kit, read-only, and built from what is stored: no SAP
 * call and no compile happens here (the contracts were compiled when each
 * service was verified). DEPRECATED interfaces are left out: the broker
 * refuses them, and a document that offered them would be wrong.
 */

import { createHash } from "crypto";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { loadDocInputs } from "@/lib/contracts/doc-inputs";
import { buildNorthboundOpenApi, type ContractForDoc, type SampledSchema } from "@/lib/contracts/openapi";
import { prisma } from "@/lib/db/prisma";
import { UNVERSIONED_BASE_PATH } from "@/lib/northbound/version-policy";
import { studioError } from "@/lib/studio/api";
import { currentResponseSchema, responseSchemaState, withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { safeName } from "@/lib/studio/scaffold";
import { isCapturedSchema } from "@/lib/studio/schema-capture";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioError("FORBIDDEN", "No organization scope.");

  const requested = request.nextUrl.searchParams.get("version") ?? "3.1";
  if (requested !== "3.1" && requested !== "3.0") {
    return studioError("VALIDATION_ERROR", "version is 3.1 (the default) or 3.0.");
  }
  const version = requested === "3.0" ? ("3.0.3" as const) : ("3.1.0" as const);

  const { id } = await ctx.params;
  const solution = await prisma.solution.findFirst({
    where: { id, organizationId },
    select: { id: true, name: true },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  const interfaces = await prisma.interface.findMany({
    where: { organizationId, solutionId: solution.id, status: { not: "DEPRECATED" } },
    select: {
      id: true,
      name: true,
      externalId: true,
      sapProduct: true,
      operation: true,
      mode: true,
      entitySet: true,
      version: true,
      status: true,
      responseSchema: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const inputs = await loadDocInputs(tenantScopeOf(organizationId), interfaces);

  const docInterfaces = interfaces.map((i) => {
    const compiled = inputs.compiled.get(i.id);
    let contract: ContractForDoc;
    if (compiled && compiled.contract.source === "METADATA") {
      contract = {
        source: "metadata",
        contract: compiled.contract,
        semver: compiled.semver,
        snapshotId: compiled.snapshotId,
        contentHash: compiled.contentHash,
        compiledAt: compiled.compiledAt,
      };
    } else {
      // Only this contract's capture, as served (contract-provenance.ts, A38).
      const captured = currentResponseSchema(i.responseSchema, i);
      const state = responseSchemaState(i.responseSchema, i);
      contract = isCapturedSchema(captured)
        ? { source: "sampled", schema: captured as unknown as SampledSchema }
        : state === "stale" || state === "unverified"
          ? { source: "none", note: withheldArtifactNote(state, i) }
          : { source: "none" };
    }
    return {
      id: i.id,
      name: i.name,
      externalId: i.externalId,
      sapProduct: i.sapProduct,
      operation: i.operation,
      mode: i.mode,
      entitySet: i.entitySet,
      version: i.version,
      status: i.status,
      contract,
      grants: inputs.grants.get(i.id) ?? [],
    };
  });

  // The document's own version: changes whenever any interface's contract does.
  const digest = createHash("sha256")
    .update(
      docInterfaces
        .map((i) => `${i.id}:${i.version}:${i.contract.source === "metadata" ? i.contract.semver : i.contract.source}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 12);

  const doc = buildNorthboundOpenApi({
    version,
    // The original path first, the versioned second (northboundServers).
    baseUrl: `${request.nextUrl.origin}${UNVERSIONED_BASE_PATH}`,
    title: `${safeName(solution.name)} — CoreEdge northbound`,
    infoVersion: `1.0.0+${digest}`,
    description: [
      `Every interface of the CoreEdge solution "${safeName(solution.name)}", as the northbound API serves it.`,
      "",
      "Generated by CoreEdge Developer Studio. This describes the CoreEdge endpoints your application calls with this solution's credential — not SAP's own API.",
      "Each interface's record shape is compiled from its service's own description when one has been verified, inferred from captured rows when only those exist, and stated as unknown otherwise (x-coreedge-interfaces[].contract.source).",
      "",
      "Honest status: an empty result is a 200 with an empty array and MUST be treated as 'no records', which is different from 'not set up' (403) and from an error (5xx).",
    ].join("\n"),
    interfaces: docInterfaces,
    discovery: true,
    safe: safeName,
  });

  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="openapi-${version === "3.0.3" ? "3.0" : "3.1"}.json"`,
    },
  });
}
