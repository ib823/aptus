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
 *
 * BOUNDED (hostile-input review round 1). The contracts it carries may add up
 * to MAX_DOCUMENT_CONTRACT_BYTES (doc-inputs.ts), checked from the sizes kept
 * at record time before any IR is read; past it the answer is a clean
 * TOO_LARGE, never the 500 that sixteen maximum-size contracts made of it.
 */

import { createHash } from "crypto";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { BudgetExceeded, documentLimit, jsonBytesUpTo, LIMITS, OutputBudget } from "@/lib/contracts/budget";
import { documentOutputTooLargeMessage, documentTooLargeMessage, loadDocInputs } from "@/lib/contracts/doc-inputs";
import {
  buildNorthboundOpenApi,
  documentJson,
  multiInterfaceInfoVersion,
  type ContractForDoc,
  type SampledSchema,
} from "@/lib/contracts/openapi";
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

  // Refused before any IR is read when the contracts add up past the budget.
  const inputs = await loadDocInputs(tenantScopeOf(organizationId), interfaces);
  if (!inputs.ok) return studioError("TOO_LARGE", documentTooLargeMessage("solution document", inputs.limit));

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

  // The build metadata of the document's version: changes whenever any interface's contract does.
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
    // Moves with its interfaces' contracts; the digest is build metadata.
    infoVersion: multiInterfaceInfoVersion(docInterfaces, digest),
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

  /*
   * UNDER THE DOCUMENT'S BUDGET (budget.ts, documentLimit): a function of
   * what was stored — each interface's compiled contract's kept size, or its
   * captured schema's — written by the one writer, which stops at the budget
   * (TOO_LARGE) before the document exists in full. Each contract was
   * rendered under its share of this budget in the compiler's envelope
   * (pipeline.ts) before it was stored.
   */
  const budget = new OutputBudget(
    "document",
    documentLimit(
      docInterfaces.map((i) =>
        i.contract.source === "metadata"
          ? (inputs.compiled.get(i.id)?.irBytes ?? 0)
          : i.contract.source === "sampled"
            ? jsonBytesUpTo(i.contract.schema, LIMITS.document.cap)
            : 0,
      ),
    ),
  );
  let body: string;
  try {
    body = documentJson(doc, budget);
  } catch (err) {
    if (!(err instanceof BudgetExceeded)) throw err;
    return studioError("TOO_LARGE", documentOutputTooLargeMessage("solution document", budget.limit));
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="openapi-${version === "3.0.3" ? "3.0" : "3.1"}.json"`,
    },
  });
}
