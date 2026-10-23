/**
 * POST /api/studio/interfaces/from-description — register an interface from
 * an uploaded service description: a DRAFT with its contract, and NO CALL TO
 * ANY TENANT (roadmap P1.2, acceptance A2).
 *
 * A multipart form of exactly two parts: `description`, the service's
 * $metadata (EDMX/CSDL XML, or CSDL JSON) as a file of at most 4 MiB, and
 * `fields`, the interface's settings as JSON — the same fields, and the same
 * catalogue-or-own-service rule, as POST /api/studio/interfaces
 * (interface-input.ts), with the dataset required: a contract describes one.
 *
 * Gates, in order, each before anything later is read:
 *   1. a builder with an organisation;
 *   2. the organisation's upload limit (RATE_LIMITS.descriptionUpload);
 *   3. the declared size: past 4 MiB and the form's overhead, 413 unread;
 *   4. the compiler's admission (contractJobAdmission): off, or the
 *      organisation's day spent, refuses before the body is read at all;
 *   5. the body read no further than its bound (bounded-body.ts);
 *   6. the parts, the file decoded as strict UTF-8, the fields validated, the
 *      solution re-scoped to the organisation (another's is a 404);
 *   7. the description compiled IN THE CONTRACT COMPILER'S WORKER, never on
 *      this thread, and the one transaction (contracts/upload.ts).
 *
 * The file name is never stored or echoed, nor is the description: its
 * sha256 and length are in the CREATE audit row. The interface carries no
 * verification, so its writes stay refused until a tenant verify.
 *
 * Reaches no SAP system, and the A.3 #9 static test proves it
 * (tests/unit/security/no-side-doors.test.ts).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { contractJobAdmission } from "@/lib/contracts/envelope";
import { serviceODataVersion } from "@/lib/contracts/record";
import {
  createInterfaceFromDescription,
  MAX_UPLOAD_DESCRIPTION_BYTES,
  MAX_UPLOAD_FIELDS_BYTES,
  UPLOAD_FORM_OVERHEAD_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
  type UploadRefusal,
} from "@/lib/contracts/upload";
import { recordJourneyEvent } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import { readBytesCapped } from "@/lib/security/bounded-body";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { isLimiterOutage, limiterUnavailableResponse } from "@/lib/security/rate-limit-response";
import { studioError, studioErrorRetryAfter, studioOk } from "@/lib/studio/api";
import { chooseService, interfaceBodySchema } from "@/lib/studio/interface-input";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";
/** The compile runs in a worker thread (lib/contracts/envelope.ts), which only the Node.js runtime has. */
export const runtime = "nodejs";
/** The platform's limit; the upload's own deadline is UPLOAD_BUDGET_MS of it, as verify-service keeps one. */
export const maxDuration = 60;

/** The upload's own deadline: the compiler's wait and run are clamped to it, with time left to write and answer. */
const UPLOAD_BUDGET_MS = 45_000;

const MAX_FORM_BYTES = MAX_UPLOAD_DESCRIPTION_BYTES + UPLOAD_FORM_OVERHEAD_BYTES;

/** The upload's fields: the registration's, with the dataset required. */
const fieldsSchema = interfaceBodySchema.extend({ entitySet: z.string().min(1).max(200) });

const PARTS_MESSAGE =
  "Send a form with two parts: the description file as `description` and the interface's settings as `fields`.";

/** A refusal from the compiler or the upload's own checks, as Studio answers it. Nothing was created. */
function uploadRefusal(r: UploadRefusal) {
  switch (r.kind) {
    case "ENVELOPE":
      switch (r.reason) {
        case "BUSY":
          return studioErrorRetryAfter("UNAVAILABLE", "The contract compiler is busy just now. Try again in a few seconds. Nothing was created.", r.retryAfterSeconds ?? 5);
        case "ALLOWANCE":
          return studioErrorRetryAfter("RATE_LIMITED", `${r.detail} Nothing was created.`, r.retryAfterSeconds ?? 60);
        case "DISABLED":
          return studioError("UNAVAILABLE", "The contract compiler is turned off on this deployment, so no description can be compiled. Nothing was created.");
        case "RESOURCE_LIMIT":
          return studioError("UNPROCESSABLE", "The description is too large or too complex for one contract compile. Nothing was created. Register the service by its path and verify it from the tenant instead.");
        case "UNAVAILABLE":
          return studioError("UNAVAILABLE", "The contract compiler could not be started. Try again in a moment. Nothing was created.");
        default:
          return studioError("UNPROCESSABLE", "The description could not be read as a service description. Nothing was created.");
      }
    case "COMPILER":
      return studioError("UNPROCESSABLE", `The description could not be compiled: ${r.detail} Nothing was created.`);
    case "NO_SUCH_ENTITY_SET":
    case "VERSION_MISMATCH":
      return studioError("UNPROCESSABLE", `${r.detail} Nothing was created.`);
    case "CONTRACT":
      return studioError("UNPROCESSABLE", `No contract could be recorded from the description: ${r.detail} Nothing was created.`);
  }
}

export async function POST(request: NextRequest) {
  const deadlineAt = Date.now() + UPLOAD_BUDGET_MS;
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (!canMutateStudio(user.role)) return studioError("FORBIDDEN", "Your role can view Studio but not author interfaces.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  const gate = await checkRateLimit(`studio:description-upload:${scope.organizationId}`, RATE_LIMITS.descriptionUpload);
  if (!gate.allowed) {
    if (isLimiterOutage(gate)) return limiterUnavailableResponse(gate);
    return studioErrorRetryAfter("RATE_LIMITED", "Your organization has uploaded many descriptions in the last hour. Try again later.", gate.resetMs / 1000);
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) return studioError("PAYLOAD_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(contentType)) return studioError("VALIDATION_ERROR", PARTS_MESSAGE);

  // The compiler's admission BEFORE the body is read: a deployment with the
  // compiler off, or an organisation whose compile time for today is spent,
  // reads nothing (as the verify asks before it fetches, service-verify.ts).
  const admission = await contractJobAdmission("record", scope.organizationId);
  if (admission !== null && !admission.ok) {
    return uploadRefusal({
      kind: "ENVELOPE",
      reason: admission.reason,
      detail: admission.detail,
      ...(admission.retryAfterMs !== undefined ? { retryAfterSeconds: Math.max(1, Math.ceil(admission.retryAfterMs / 1000)) } : {}),
    });
  }

  const body = await readBytesCapped(request, MAX_FORM_BYTES);
  if (!body.ok) {
    return body.reason === "TOO_LARGE" ? studioError("PAYLOAD_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE) : studioError("VALIDATION_ERROR", PARTS_MESSAGE);
  }
  let form: FormData;
  try {
    form = await new Response(body.bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    return studioError("VALIDATION_ERROR", PARTS_MESSAGE);
  }
  const keys = [...form.keys()];
  if (keys.length !== 2 || keys.filter((k) => k === "description").length !== 1 || keys.filter((k) => k === "fields").length !== 1) {
    return studioError("VALIDATION_ERROR", PARTS_MESSAGE);
  }
  const file = form.get("description");
  const rawFields = form.get("fields");
  if (!(file instanceof Blob) || typeof rawFields !== "string") return studioError("VALIDATION_ERROR", PARTS_MESSAGE);
  if (file.size > MAX_UPLOAD_DESCRIPTION_BYTES) return studioError("PAYLOAD_TOO_LARGE", UPLOAD_TOO_LARGE_MESSAGE);
  if (file.size === 0) return studioError("VALIDATION_ERROR", "The description file is empty.");
  if (new TextEncoder().encode(rawFields).byteLength > MAX_UPLOAD_FIELDS_BYTES) return studioError("VALIDATION_ERROR", "Invalid interface payload.");

  let fieldsJson: unknown;
  try {
    fieldsJson = JSON.parse(rawFields);
  } catch {
    return studioError("VALIDATION_ERROR", "Invalid interface payload.");
  }
  const parsed = fieldsSchema.safeParse(fieldsJson);
  if (!parsed.success) {
    return studioError("VALIDATION_ERROR", "Invalid interface payload. Name the dataset (entity set) the interface reads or writes, too.");
  }
  const input = parsed.data;
  const choice = chooseService(input);
  if (!choice.ok) return studioError("VALIDATION_ERROR", choice.message);

  // Strict UTF-8, as SAP serves EDMX: a description in another encoding would
  // compile to labels nobody wrote. A byte-order mark is dropped by the decoder.
  let description: string;
  try {
    description = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return studioError("VALIDATION_ERROR", "The description is not UTF-8 text. Save the description as UTF-8 and upload it again.");
  }

  // Re-scope the attacker-supplied solutionId to this tenant. Never trust it.
  const solution = await prisma.solution.findFirst({
    where: { id: input.solutionId, organizationId: scope.organizationId },
    select: { id: true },
  });
  if (!solution) return studioError("NOT_FOUND", "Solution not found.");

  // The version the service is known by: the own service's declared one, or the catalogue service's.
  const declaredVersion =
    choice.odataVersion ?? (await serviceODataVersion({ sapProduct: input.sapProduct, externalId: choice.externalId }));
  if (!declaredVersion) {
    return studioError(
      "VALIDATION_ERROR",
      "CoreEdge does not know this catalogue service, so it cannot tell which description belongs to it. If it is your own service, register it by its service path instead.",
    );
  }

  const outcome = await createInterfaceFromDescription({
    scope,
    actorId: user.id,
    fields: {
      solutionId: solution.id,
      sapProduct: input.sapProduct,
      name: input.name,
      operation: input.operation,
      entitySet: input.entitySet,
      externalId: choice.externalId,
      servicePath: choice.servicePath,
      odataVersion: choice.odataVersion,
    },
    declaredVersion,
    description,
    deadlineAt,
  });
  if (!outcome.ok) return uploadRefusal(outcome.refusal);

  // The app's first interface is a journey milestone (P2.12), written after
  // the commit as the registration writes it. Never fails the upload.
  await recordJourneyEvent({
    organizationId: scope.organizationId,
    kind: "INTERFACE_REGISTERED",
    solutionId: solution.id,
    subjectId: outcome.interface.id,
    actorUserId: user.id,
  });

  return studioOk(
    {
      interface: outcome.interface,
      contract: {
        status: "RECORDED" as const,
        snapshotId: outcome.snapshot.id,
        semver: outcome.snapshot.semver,
        describedBy: "upload" as const,
        requestSchemaWritten: outcome.requestSchemaWritten,
      },
      verified: false,
      message: "Contract recorded from your file. Verify it against a tenant before any write.",
    },
    201,
  );
}
