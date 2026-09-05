/**
 * POST /api/tobe/[bundleId]/generate — 2608 WS6.
 *
 * Generates a To-Be Process Pack for one affirm bundle (the "engagement") from
 * its scope set, the client's answers and the TobeRule table, and stores it as
 * a new TobePack row. Nothing is invented: steps come from the 2608 BPD data
 * files, states only from rules whose trigger matches an answer.
 *
 * Gate order — flag, session, role, bundle ownership — so an unauthenticated
 * caller learns nothing about the bundle, and a deployment with the flag off
 * 404s before any of that.
 */
import { NextResponse } from "next/server";

import { requireAffirmBundleAccess } from "@/lib/affirm/authz";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isTobePackEnabled } from "@/lib/tobe/guards";
import { generateAndSavePack } from "@/lib/tobe/inputs";
import { canPerformAffirmAction } from "@/lib/workbench/rbac";

export async function POST(_req: Request, ctx: { params: Promise<{ bundleId: string }> }) {
  if (!isTobePackEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The roles that may start a bundle may generate its pack; view-only roles
  // read the pack that exists.
  if (!canPerformAffirmAction(user.role, "create_bundle")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { bundleId } = await ctx.params;
  const access = await requireAffirmBundleAccess(bundleId, user);
  if (!access.ok) return access.response;

  const result = await generateAndSavePack(prisma, bundleId, user.id);
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    {
      packId: result.pack.id,
      generatedAt: result.pack.generatedAt.toISOString(),
      release: result.doc.release,
      hashes: result.doc.hashes,
      summary: result.doc.summary,
    },
    { status: 201 },
  );
}
