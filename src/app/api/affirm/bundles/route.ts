/**
 * POST /api/affirm/bundles — create a new draft affirm-bundle.
 *
 * Body: { client: string, scopeItemIds: string[] }
 *
 * Returns 201 with the bundle's id + initial state. Caller is the
 * authenticated consultant; the consultant is the only actor that ever
 * creates a bundle (master prompt §2 — Manual scope intake).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

const Body = z.object({
  client: z.string().trim().min(1).max(200),
  scopeItemIds: z.array(z.string().trim().min(1)).max(672),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.format() },
      { status: 400 },
    );
  }

  const bundle = await prisma.$transaction(async (tx) => {
    const b = await tx.affirmBundle.create({
      data: {
        client: parsed.data.client,
        state: "draft",
        createdById: user.id,
      },
    });

    if (parsed.data.scopeItemIds.length) {
      await tx.affirmBundleScopeItem.createMany({
        data: parsed.data.scopeItemIds.map((scopeItemId) => ({
          bundleId: b.id,
          scopeItemId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.affirmEvent.create({
      data: {
        bundleId: b.id,
        type: "bundle_created",
        actorId: user.id,
        payload: { scopeCount: parsed.data.scopeItemIds.length },
      },
    });

    return b;
  });

  return NextResponse.json(
    { id: bundle.id, state: bundle.state },
    { status: 201 },
  );
}
