/**
 * PUT /api/affirm/bundles/[id]/scope — replace the bundle's selected
 * scope items. Allowed only while the bundle is in DRAFT state. The
 * issue step (next stop) freezes scope.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

const Body = z.object({
  scopeItemIds: z.array(z.string().trim().min(1)).max(672),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      select: { id: true, state: true },
    });
    if (!bundle) return { error: "not_found" as const };
    if (bundle.state !== "draft") return { error: "locked" as const };

    await tx.affirmBundleScopeItem.deleteMany({ where: { bundleId: id } });
    if (parsed.data.scopeItemIds.length) {
      await tx.affirmBundleScopeItem.createMany({
        data: parsed.data.scopeItemIds.map((scopeItemId) => ({
          bundleId: id,
          scopeItemId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "scope_updated",
        actorId: user.id,
        payload: { count: parsed.data.scopeItemIds.length },
      },
    });

    return { ok: true as const };
  });

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
