/**
 * GET /api/discovery/packs/[id]?lane=client|internal — download a pack.
 *
 * TWO LANES, and the lane is a required, explicit parameter with no default. An
 * omitted or unknown lane is a 400 — not "fall back to internal", and not "fall
 * back to client" either. A default here would be the single point of failure
 * that §9.3's whole design exists to remove.
 *
 * Each lane calls its OWN builder. There is no shared builder with a flag.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildClientPack, buildInternalPack } from "@/lib/discovery/workbench/packs";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";
import { requireDiscoveryEngagementAccess } from "@/lib/discovery/authz";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // Scope to the engagement's owner (creator) or platform_admin. Without this,
  // any authenticated user could export any engagement's pack by ID — the
  // internal lane in particular carries consultant-only product map / notes /
  // capture data. Matches the guard on the sibling notes/grants/drive routes.
  const access = await requireDiscoveryEngagementAccess(id, user);
  if (!access.ok) return access.response;

  const lane = req.nextUrl.searchParams.get("lane");

  if (lane === "client") {
    const pack = await buildClientPack(id);
    if (!pack) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(pack, {
      headers: {
        "Content-Disposition": `attachment; filename="discovery-client-pack-${id}.json"`,
      },
    });
  }

  if (lane === "internal") {
    const pack = await buildInternalPack(id);
    if (!pack) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(pack, {
      headers: {
        "Content-Disposition": `attachment; filename="discovery-INTERNAL-pack-${id}.json"`,
      },
    });
  }

  // No default lane, on purpose.
  return NextResponse.json({ error: "lane_required" }, { status: 400 });
}
