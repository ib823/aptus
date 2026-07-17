/**
 * POST /api/discovery/product-map — persist a hand-entered product mapping.
 *
 * ⚠ CONSULTANT-ONLY. Authenticated workbench users only. This route is the write
 * half of the fence; the dependency-boundary test asserts no (external) module
 * can reach it, its components, or its table.
 *
 * SAP is NOT writable. It is derived from origin/scope_id at read time, so there
 * is no code path — not even an authenticated one — that can record a base
 * reference the library does not support. A fabricated SAP fill would have to be
 * a library change, which is what the P4 pipeline is for.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { findLibraryRow } from "@/lib/discovery/workbench/library";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

const MAX_REF = 120;

function clean(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length > MAX_REF) return undefined;
  return t;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { processId, oracleRef, netsuiteRef, otherRef } = body as Record<string, unknown>;

  if (typeof processId !== "string" || !findLibraryRow(processId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const oracle = clean(oracleRef);
  const netsuite = clean(netsuiteRef);
  const other = clean(otherRef);
  if (oracle === undefined && netsuite === undefined && other === undefined) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  await prisma.discoveryProductMap.upsert({
    where: { processId },
    create: {
      processId,
      oracleRef: oracle ?? null,
      netsuiteRef: netsuite ?? null,
      otherRef: other ?? null,
      notedById: user.id,
    },
    update: {
      ...(oracle !== undefined ? { oracleRef: oracle } : {}),
      ...(netsuite !== undefined ? { netsuiteRef: netsuite } : {}),
      ...(other !== undefined ? { otherRef: other } : {}),
      notedById: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
