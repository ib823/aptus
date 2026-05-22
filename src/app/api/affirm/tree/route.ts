/**
 * GET /api/affirm/tree — the 3-tier value-stream tree.
 *
 * Powers Screen 1's tree picker. Returns 8 streams + Foundation, their
 * 55 sub-processes, and the 672 scope items, with coverage flags. The
 * tree is the same for every consultant; results can be cached behind
 * the front door (the seed dataset is static per SAP release).
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getValueStreamTree } from "@/lib/affirm/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tree = await getValueStreamTree();
  return NextResponse.json({ tree });
}
