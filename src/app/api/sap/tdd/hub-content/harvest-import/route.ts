/**
 * POST /api/sap/tdd/hub-content/harvest-import — import HARVESTED Hub artifacts
 * into a deployed instance, in bounded chunks, without bundling a single byte.
 *
 * Body: { confirmation, contentType, offset?, limit? }
 *   contentType  one of BADI | BO_INTERFACE | EVENT | INTEGRATION | SCENARIO
 *   offset       row to resume from (default 0)
 *   limit        rows this call may process (default 400, max 1000)
 *
 * Responds with `nextOffset` — null when the file is finished, a number when it
 * is not. See hub-harvest-remote.ts for why the ref is pinned to the deployed
 * commit and refused when it cannot be.
 *
 * ============================================================================
 * WHY A SEPARATE ROUTE FROM ../seed
 * ============================================================================
 * The Rebuild endpoint imports what is BUNDLED — files traced into the function
 * at build time, so its work is bounded by the deployment and it can finish in
 * one call. This one fetches over the network and is bounded by nothing, so it
 * is chunked and resumable, and its failure modes (unreachable host, unpinned
 * ref, a commit that predates the files) are ones Rebuild cannot have.
 *
 * Folding it in would have meant one endpoint whose guarantees depend on which
 * contentType you passed. They are kept apart so each one's contract is true of
 * every call it accepts.
 *
 * IMPORT NOTHING STATICALLY FROM sap-references/hub-harvest HERE. That is the
 * whole point; a test asserts it.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, SapHubContentType } from "@prisma/client";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { normalizeHubRowForType } from "@/lib/sap-public/hub-import";
import {
  HARVEST_CHUNK_DEFAULT,
  HARVEST_TYPES,
  asHubContentType,
  fetchHarvestRows,
  harvestFileUrl,
  isHarvestType,
  resolveHarvestSource,
  sliceHarvest,
} from "@/lib/sap-public/hub-harvest-remote";
import { logDecision } from "@/lib/audit/decision-logger";
import type { DecisionAction, UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

// One chunk is a network fetch plus a bounded batch of writes. 60s is the
// platform ceiling on the current plan and comfortably over what 400 rows take;
// a chunk that cannot finish inside it should be made smaller, not longer.
export const maxDuration = 60;

const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message } }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown; contentType?: unknown; offset?: unknown; limit?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (body.confirmation !== CONFIRMATION) {
    return badRequest(`Confirmation phrase required: "${CONFIRMATION}"`);
  }

  const target = typeof body.contentType === "string" ? body.contentType.toUpperCase().replace(/[\s-]+/g, "_") : "";
  if (!isHarvestType(target)) {
    return badRequest(
      `Unknown or non-harvested contentType "${target}". The harvest emits individual rows for: ${HARVEST_TYPES.join(", ")}. ` +
        "CDS_VIEW and BUILD are deliberately counts-only (see hub-artifact-counts.json).",
    );
  }

  const source = resolveHarvestSource();
  if ("reason" in source) {
    // NOT an error state — a known one, with a different fix. Same distinction
    // the console draws between "Needs setup" and "Failed".
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: source.reason, state: "NOT_CONFIGURED" } },
      { status: 400 },
    );
  }

  const url = harvestFileUrl(source, target);
  const fetched = await fetchHarvestRows(url);
  if ("error" in fetched) {
    return NextResponse.json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: fetched.error } }, { status: 502 });
  }

  const chunk = sliceHarvest(
    fetched.rows,
    typeof body.offset === "number" ? body.offset : 0,
    typeof body.limit === "number" ? body.limit : HARVEST_CHUNK_DEFAULT,
  );

  const ct = asHubContentType(target) as SapHubContentType;
  const importedAt = new Date().toISOString();
  const provenance = `harvest:${target}@${source.ref.slice(0, 7)}`;

  // Normalise first, so a malformed row is counted rather than throwing mid-batch
  // and leaving the caller unable to tell how far the import actually got.
  let skipped = 0;
  const normalized = [];
  for (const raw of chunk.rows) {
    const norm = normalizeHubRowForType(raw, asHubContentType(target));
    if (!norm) {
      skipped++;
      continue;
    }
    normalized.push(norm);
  }

  /*
   * ONE READ FOR THE WHOLE CHUNK, NOT ONE PER ROW.
   *
   * The local script and the Rebuild endpoint both findUnique per row, which is
   * fine at their sizes and would be 8,878 round trips for INTEGRATION's 4,439.
   * Over a pooled connection from a serverless function that is the difference
   * between finishing and timing out halfway, which would leave a partial import
   * that looks exactly like a complete one.
   */
  const ids = normalized.map((n) => n.externalId);
  const existingRows = ids.length
    ? await prisma.sapHubContent.findMany({
        where: { contentType: ct, externalId: { in: ids } },
        select: { id: true, externalId: true, illustrative: true },
      })
    : [];
  const existing = new Map(existingRows.map((r) => [r.externalId, r]));

  const toCreate: Prisma.SapHubContentCreateManyInput[] = [];
  const toUpdate: { id: string; data: Prisma.SapHubContentUpdateInput }[] = [];
  let skippedReal = 0;

  for (const norm of normalized) {
    const data = {
      title: norm.title,
      description: norm.description,
      packageId: norm.packageId,
      appliesToPublic: norm.appliesToPublic,
      appliesToPrivate: norm.appliesToPrivate,
      appliesToOnPrem: norm.appliesToOnPrem,
      productTags: norm.productTags,
      status: norm.status,
      apiType: norm.apiType,
      communicationScenarios: norm.communicationScenarios,
      scopeItemCodes: norm.scopeItemCodes,
      itemCount: norm.itemCount,
      illustrative: norm.illustrative,
      hubUrl: norm.hubUrl,
      // Which harvest, at which commit. "Is the catalogue current?" stays answerable
      // from the row itself rather than from whoever last ran the import.
      rawMetadataJson: {
        source: provenance,
        repo: source.repo,
        ref: source.ref,
        refSource: source.refSource,
        release: null,
        importedAt,
        raw: norm.rawJson,
      } as Prisma.InputJsonValue,
    };
    const prev = existing.get(norm.externalId);
    if (!prev) {
      toCreate.push({ contentType: ct, externalId: norm.externalId, ...data });
      continue;
    }
    /*
     * AN ILLUSTRATIVE ROW MUST NOT REPLACE A REAL ONE — the rule from #216,
     * carried here because it travels with the upsert key, not with the caller.
     * Harvested rows are all illustrative:false today, so this should never
     * fire; it is here so that stops being something to remember if that changes.
     */
    if (norm.illustrative && prev.illustrative === false) {
      skippedReal++;
      continue;
    }
    toUpdate.push({ id: prev.id, data });
  }

  const created = toCreate.length ? await prisma.sapHubContent.createMany({ data: toCreate, skipDuplicates: true }) : { count: 0 };
  for (const u of toUpdate) {
    await prisma.sapHubContent.update({ where: { id: u.id }, data: u.data });
  }

  const stats = {
    contentType: target,
    source: provenance,
    repo: source.repo,
    ref: source.ref,
    offset: chunk.offset,
    limit: chunk.limit,
    processed: chunk.rows.length,
    total: chunk.total,
    inserted: created.count,
    updated: toUpdate.length,
    skipped,
    skippedReal,
    // Explicit, so "did it finish?" is read rather than inferred from arithmetic.
    nextOffset: chunk.nextOffset,
    complete: chunk.nextOffset === null,
  };

  try {
    await logDecision({
      assessmentId: null,
      entityType: "sap_hub_seed",
      entityId: "hub-harvest-import",
      action: "SAP_HUB_TYPE_IMPORTED" satisfies DecisionAction,
      newValue: stats as unknown as Prisma.InputJsonValue,
      actor: auth.user.email ?? "system",
      actorRole: (auth.user.role ?? "system") as UserRole,
    });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ data: stats });
}
