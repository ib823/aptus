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
 *
 * DECIDED BEFORE IT IS LOADED OR BUILT (structural hardening round 1). The
 * route used to select every interface's stored captured schema, build the
 * whole document, and only then consult the budget while serialising it:
 * 20,000 interfaces held 269 MB of heap, and fifty 11.5 MB captures 1.85 GB,
 * before the answer was TOO_LARGE. Now, in order, each step bounded by the
 * one before it:
 *
 *   1. at most maxDocumentInterfaces() interfaces (budget.ts: as many as the
 *      document's cap has room for), counted before anything else is read;
 *   2. the compiled contracts and the captured schemas the document will
 *      carry add up to MAX_DOCUMENT_CONTRACT_BYTES at most, from the sizes
 *      the database keeps or measures — before any of them is read;
 *   3. only the captured schemas that will be rendered are read, each inside
 *      the captured-schema bound (response-schema-states.ts);
 *   4. the document is built under its budget, each interface's part charged
 *      as it is built, so the build stops at the interface that passes it;
 *   5. and written under the same budget —
 *   6. in a render job, in the Contract Compiler's worker, through its one
 *      fair gate and charged to the downloading organisation's daily
 *      compiler time (envelope.ts): never on the request thread (a document
 *      inside its 32 MiB budget takes a second to build). Busy: 503, retry
 *      in seconds; the organisation's time spent: 429 until 00:00 UTC.
 */

import { createHash } from "crypto";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { documentLimit, jsonBytesUpTo, LIMITS, maxDocumentInterfaces } from "@/lib/contracts/budget";
import {
  documentTooLargeMessage,
  documentTooManyInterfacesMessage,
  STUDIO_JOB_DEADLINE_MS,
  downloadRefusal,
  loadDocContracts,
  MAX_DOCUMENT_CONTRACT_BYTES,
  planDocInputs,
} from "@/lib/contracts/doc-inputs";
import { runContractJob } from "@/lib/contracts/envelope";
import { multiInterfaceInfoVersion, type ContractForDoc, type SampledSchema } from "@/lib/contracts/openapi";
import { prisma } from "@/lib/db/prisma";
import { UNVERSIONED_BASE_PATH } from "@/lib/northbound/version-policy";
import { studioError } from "@/lib/studio/api";
import { withheldArtifactNote } from "@/lib/studio/contract-provenance";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { capturedSchemaFacts, capturedSchemaReadable, readCurrentCapturedSchemas } from "@/lib/studio/response-schema-states";
import { safeName } from "@/lib/studio/scaffold";
import { isCapturedSchema } from "@/lib/studio/schema-capture";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/** The document renders in a worker thread (lib/contracts/envelope.ts): Node.js only. */
export const runtime = "nodejs";

const CAPTURE_TOO_LARGE_NOTE = `Its captured schema is larger than a captured schema may be (${LIMITS.capturedSchema.properties.toLocaleString("en")} fields, ${LIMITS.capturedSchema.bytes / 1024} KB), so it is not described. Run the interface in the Test Console and capture again, or verify the service to compile its contract.`;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deadlineAt = Date.now() + STUDIO_JOB_DEADLINE_MS;
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
      // Not responseSchema: only the captured schemas the document renders are read (below).
      // The compiled query policy (P1.4): at most 64 KiB each, held at its one writer.
      queryPolicyCompiled: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    // 1. One more than a document carries is enough to know it is too many.
    take: maxDocumentInterfaces() + 1,
  });
  if (interfaces.length > maxDocumentInterfaces()) {
    return studioError("TOO_LARGE", documentTooManyInterfacesMessage(maxDocumentInterfaces()));
  }

  // 2. Refused before any IR is read when the contracts add up past the budget.
  const scope = tenantScopeOf(organizationId);
  const plan = await planDocInputs(scope, interfaces);
  if (!plan.ok) return studioError("TOO_LARGE", documentTooLargeMessage("solution document", plan.limit));

  // …and with the captured schemas it would carry, from their stored sizes, before any is read.
  const sampledOnly = interfaces.filter((i) => plan.summaries.get(i.id)?.source !== "METADATA");
  const facts = await capturedSchemaFacts(organizationId, sampledOnly);
  let capturedBytes = 0;
  for (const f of facts.values()) if (f.state === "current" && capturedSchemaReadable(f.storedBytes)) capturedBytes += f.storedBytes ?? 0;
  let carried = capturedBytes;
  for (const s of plan.summaries.values()) if (s.source === "METADATA") carried += s.irBytes ?? 0;
  if (carried > MAX_DOCUMENT_CONTRACT_BYTES) {
    return studioError("TOO_LARGE", documentTooLargeMessage("solution document", MAX_DOCUMENT_CONTRACT_BYTES));
  }

  /*
   * 3-6. LOADED ONLY ONCE IT HOLDS ITS SLOT (envelope.ts): the contracts'
   * IRs and the captured schemas are read by the loader below, so a
   * download refused or still waiting has read none of them.
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
      const compiledById = contracts.compiled;
      // Rows that predate the kept size were measured as they were read: the same bound, again.
      let carriedNow = capturedBytes;
      for (const c of compiledById.values()) if (c.source === "METADATA") carriedNow += c.irBytes;
      if (carriedNow > MAX_DOCUMENT_CONTRACT_BYTES) {
        refused = MAX_DOCUMENT_CONTRACT_BYTES;
        return null;
      }
      // 3. Only those, each inside the captured-schema bound.
      const captures = await readCurrentCapturedSchemas(organizationId, sampledOnly, facts);

      const docInterfaces = interfaces.map((i) => {
        const compiled = compiledById.get(i.id);
        let contract: ContractForDoc;
        if (compiled && compiled.source === "METADATA") {
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
          const captured = captures.get(i.id);
          const state = facts.get(i.id)?.state ?? "none";
          contract =
            captured?.ok && isCapturedSchema(captured.schema)
              ? { source: "sampled", schema: captured.schema as unknown as SampledSchema }
              : captured && !captured.ok
                ? { source: "none", note: CAPTURE_TOO_LARGE_NOTE }
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
          grants: plan.grants.get(i.id) ?? [],
          // Its query parameters are documented when the policy is READY (openapi.ts).
          queryPolicy: i.queryPolicyCompiled,
        };
      });

      // The build metadata of the document's version: changes whenever any interface's contract does.
      const digest = createHash("sha256")
        .update(
          docInterfaces
            .map(
              (i) =>
                `${i.id}:${i.version}:${i.contract.source === "metadata" ? i.contract.semver : i.contract.source}:${policyRevOf(i.queryPolicy)}`,
            )
            .join("|"),
        )
        .digest("hex")
        .slice(0, 12);

      /*
       * UNDER THE DOCUMENT'S BUDGET (budget.ts, documentLimit): a function of
       * what was stored — each interface's compiled contract's kept size, or
       * its captured schema's. 4. The build charges each interface's part to
       * it as the part is made, and stops at the interface that passes it; 5.
       * the writer charges every byte written, and stops the same way.
       */
      limit = documentLimit(
        docInterfaces.map(
          (i) =>
            (i.contract.source === "metadata"
              ? (compiledById.get(i.id)?.irBytes ?? 0)
              : i.contract.source === "sampled"
                ? jsonBytesUpTo(i.contract.schema, LIMITS.document.cap)
                : 0) +
            // A query policy's parameters are written from it, so it is charged like a contract.
            (i.queryPolicy === null ? 0 : jsonBytesUpTo(i.queryPolicy, LIMITS.queryPolicyCompiled.bytes)),
        ),
      );
      return {
        kind: "render",
        input: {
          path: "document",
          doc: {
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
          },
          limit,
        },
      };
    },
    { tenant: organizationId, deadlineAt },
  );
  if (rendered === null) return studioError("TOO_LARGE", documentTooLargeMessage("solution document", refused ?? plan.limit));
  if (!rendered.ok) return downloadRefusal("solution document", rendered, limit);
  if (!rendered.value.ok) return downloadRefusal("solution document", { reason: "RESOURCE_LIMIT", detail: "" }, rendered.value.limit);
  const body = rendered.value.text;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="openapi-${version === "3.0.3" ? "3.0" : "3.1"}.json"`,
    },
  });
}

/** The compiled query policy's content hash, for the document's build metadata; "-" without one. */
function policyRevOf(policy: unknown): string {
  return policy !== null && typeof policy === "object" && typeof (policy as { rev?: unknown }).rev === "string"
    ? (policy as { rev: string }).rev
    : "-";
}
