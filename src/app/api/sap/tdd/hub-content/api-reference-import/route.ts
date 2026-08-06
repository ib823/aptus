/**
 * POST /api/sap/tdd/hub-content/api-reference-import — import the committed
 * API catalogue drop into SapApiReference, in bounded chunks, on a deployed
 * instance.
 *
 * Body: { confirmation, offset?, limit? } → responds with `nextOffset` (null
 * when the file is finished), same contract as ../harvest-import.
 *
 * ============================================================================
 * THE GAP THIS CLOSES
 * ============================================================================
 * The Discover API tile projects from SapApiReference, and that table was
 * only ever writable by `pnpm sap:catalog:import` — a laptop with the
 * production DATABASE_URL. A deployment whose reference predated product tags
 * could therefore never surface private-edition or SuccessFactors APIs: the
 * hub-content Rebuild re-projects faithfully, but it had nothing multi-product
 * to project FROM, and every other content type gained a deployed import path
 * while the one the API tile depends on did not.
 *
 * Same discipline as harvest-import, deliberately: fetched at request time
 * from the repository at the PINNED DEPLOYED COMMIT (never a branch, refused
 * without a SHA — see hub-harvest-remote's header for why), chunked and
 * resumable because the file holds ~4,600 rows, normalized by the SAME shared
 * normalizer the script uses, and idempotent (upsert by apiId). `apiType` is
 * only written when the file declares one, so values backfilled by
 * scripts/ingest/refresh-api-types.ts are never clobbered.
 *
 * AFTER THIS FINISHES, RUN THE REBUILD. This import refreshes the reference
 * table; the catalogue rows the console reads are projected from it by the
 * ../seed route. The Catalogue Health screen chains the two automatically.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import {
  API_CATALOG_REPO_PATH,
  normalizeRow,
  parseJson,
} from "@/lib/sap-public/api-reference-import";
import { mapEditionFromProductTags } from "@/lib/sap-public/edition-tags";
import {
  HARVEST_CHUNK_DEFAULT,
  resolveHarvestSource,
  sliceHarvest,
} from "@/lib/sap-public/hub-harvest-remote";
import { logDecision } from "@/lib/audit/decision-logger";
import type { DecisionAction, UserRole } from "@/types/assessment";
import { ERROR_CODES } from "@/types/api";

// One chunk is a network fetch plus a bounded batch of writes — same ceiling
// and reasoning as harvest-import.
export const maxDuration = 60;

const CONFIRMATION = "REBUILD SAP HUB CATALOGUE";

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message } }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  let body: { confirmation?: unknown; offset?: unknown; limit?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (body.confirmation !== CONFIRMATION) {
    return badRequest(`Confirmation phrase required: "${CONFIRMATION}"`);
  }

  const source = resolveHarvestSource();
  if ("reason" in source) {
    // A known state with a different fix than a failure — same distinction the
    // console draws between "Needs setup" and "Failed".
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: source.reason, state: "NOT_CONFIGURED" } },
      { status: 400 },
    );
  }

  const url = `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${API_CATALOG_REPO_PATH}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}` } },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: `${url} returned HTTP ${res.status}. The commit may predate the catalogue drop, or the repository may not be public.` } },
      { status: 502 },
    );
  }

  // parseJson handles the harvester envelope ({ _provenance, apis }) as well
  // as plain arrays and OData shapes — the same acceptance as the script.
  let allRows: Record<string, unknown>[];
  try {
    allRows = parseJson(await res.text());
  } catch (err) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: `${url}: ${err instanceof Error ? err.message : "unparseable"}` } },
      { status: 502 },
    );
  }

  const chunk = sliceHarvest(
    allRows,
    typeof body.offset === "number" ? body.offset : 0,
    typeof body.limit === "number" ? body.limit : HARVEST_CHUNK_DEFAULT,
  );

  // Normalise first, so a malformed row is counted rather than throwing
  // mid-batch and leaving the caller unable to tell how far the import got.
  let skipped = 0;
  const normalized = [];
  for (const raw of chunk.rows) {
    const norm = normalizeRow(raw);
    if (!norm) {
      skipped++;
      continue;
    }
    normalized.push(norm);
  }

  // One read for the whole chunk, not one per row — the same pooled-connection
  // arithmetic as harvest-import, and the same failure it prevents: a timeout
  // halfway through that looks exactly like a complete import.
  const ids = normalized.map((n) => n.apiId);
  const existingRows = ids.length
    ? await prisma.sapApiReference.findMany({
        where: { apiId: { in: ids } },
        select: { id: true, apiId: true },
      })
    : [];
  const existing = new Map(existingRows.map((r) => [r.apiId, r.id]));

  let inserted = 0;
  let updated = 0;
  const editionTally = { public: 0, private: 0, onPrem: 0, untagged: 0 };

  for (const norm of normalized) {
    const editions = mapEditionFromProductTags(norm.productTags);
    if (editions.appliesToPublic) editionTally.public++;
    if (editions.appliesToPrivate) editionTally.private++;
    if (editions.appliesToOnPrem) editionTally.onPrem++;
    if (!editions.appliesToPublic && !editions.appliesToPrivate && !editions.appliesToOnPrem) {
      editionTally.untagged++;
    }

    const data = {
      apiId: norm.apiId,
      apiName: norm.apiName,
      description: norm.description,
      status: norm.status,
      category: norm.category,
      appliesToPublic: editions.appliesToPublic,
      appliesToPrivate: editions.appliesToPrivate,
      appliesToOnPrem: editions.appliesToOnPrem,
      productTags: norm.productTagsRaw,
      // Only write apiType when the file declares one — preserves backfills.
      ...(norm.apiType ? { apiType: norm.apiType } : {}),
      scopeItemCodes: norm.scopeItemCodes,
      communicationScenarios: norm.communicationScenarios,
      apiHubUrl: norm.apiHubUrl,
      rawMetadataJson: norm.rawJson as Prisma.InputJsonValue,
      etag: null,
      lastFetchedAt: new Date(),
    };

    const existingId = existing.get(norm.apiId);
    if (existingId) {
      await prisma.sapApiReference.update({ where: { id: existingId }, data });
      updated++;
    } else {
      await prisma.sapApiReference.create({ data });
      inserted++;
    }
  }

  const stats = {
    source: `api-reference@${source.ref.slice(0, 7)}`,
    repo: source.repo,
    ref: source.ref,
    offset: chunk.offset,
    limit: chunk.limit,
    processed: chunk.rows.length,
    total: chunk.total,
    inserted,
    updated,
    skipped,
    editions: editionTally,
    // Explicit, so "did it finish?" is read rather than inferred.
    nextOffset: chunk.nextOffset,
    complete: chunk.nextOffset === null,
  };

  try {
    await logDecision({
      assessmentId: null,
      entityType: "sap_hub_seed",
      entityId: "api-reference-import",
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
