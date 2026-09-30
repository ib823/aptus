import { NextResponse, type NextRequest } from "next/server";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { parseProductScopeManifest } from "@/lib/product-scope/manifest";
import { productScopeSourceHash, upsertProductScopeRecords } from "@/lib/product-scope/write";

export const maxDuration = 60;

const MAX_BODY_BYTES = 2_000_000;
const MAX_ROWS = 50;

async function readBoundedJsonBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

function reject(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Import one bounded, validated chunk from an ABeam-admin browser session. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) return reject("Same-origin request required", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reject("JSON body required", 415);

  const raw = await readBoundedJsonBody(request);
  if (raw === null) return reject("Chunk is too large", 413);

  let records;
  try {
    const body: unknown = JSON.parse(raw);
    if (!Array.isArray(body) || body.length < 1 || body.length > MAX_ROWS) {
      return reject(`Send 1–${MAX_ROWS} manifest records per chunk`, 400);
    }
    records = parseProductScopeManifest(body);
    if (records.some((record) => record.visibility !== "ABEAM_ADMIN")) {
      return reject("Browser imports must be ABeam-admin-only records", 400);
    }
  } catch (error) {
    return reject(error instanceof Error ? error.message : "Invalid manifest chunk", 400);
  }

  try {
    await upsertProductScopeRecords(prisma, records);
    const identities = records.map(({ productKey, solutionKey, release, country, language, scopeCode }) =>
      ({ productKey, solutionKey, release, country, language, scopeCode }));
    const landed = await prisma.productScopeItem.findMany({
      where: { OR: identities },
      select: { productKey: true, solutionKey: true, release: true, country: true,
        language: true, scopeCode: true, sourceHash: true, visibility: true },
    });
    const key = (item: typeof identities[number]) =>
      [item.productKey, item.solutionKey, item.release, item.country, item.language, item.scopeCode].join("/");
    const landedByKey = new Map(landed.map((item) => [key(item), item]));
    const verified = records.every((record) => {
      const item = landedByKey.get(key(record));
      return item?.sourceHash === productScopeSourceHash(record) && item.visibility === record.visibility;
    });
    if (!verified) return reject("Import verification failed; retry this chunk", 500);
    return NextResponse.json({ imported: records.length, verified: records.length,
      withSteps: records.filter((record) => record.processSteps.length > 0).length,
      withQuestions: records.filter((record) => record.configQuestions.length > 0).length,
      restricted: records.filter((record) => record.visibility === "ABEAM_ADMIN").length,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return reject("Import failed; retry this chunk after checking the deployment", 500);
  }
}
