/**
 * /api/affirm/bundles/[id]/grants
 *   GET  — list grants for the review-screen panel (status + progress).
 *   POST — create a per-executive grant and email the invite.
 *
 * Consultant-authed via getCurrentUser (same as every other affirm route). Flat
 * { error } envelope, inline zod validation — matching the affirm convention.
 * This route lives under /api/affirm/* so it IS middleware-rate-limited.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { createGrant, listGrantsForBundle } from "@/lib/affirm/external/grants";
import { dispatchEmail } from "@/lib/presales/emails";
import { renderAffirmInviteEmail } from "@/lib/affirm/external/emails";

const Body = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  roleLabel: z.string().max(80).nullish(),
  valueStreamIds: z.array(z.string()).default([]),
});

function inviteUrl(req: NextRequest, rawToken: string): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  return `${origin}/a/${rawToken}`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const bundle = await prisma.affirmBundle.findUnique({ where: { id }, select: { id: true } });
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const grants = await listGrantsForBundle(id);
  return NextResponse.json({ grants });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { email, displayName, valueStreamIds } = parsed.data;
  const roleLabel = parsed.data.roleLabel ?? null;

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id },
    select: { id: true, client: true, state: true },
  });
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Grants only make sense once the bundle is client-facing.
  if (bundle.state !== "issued" && bundle.state !== "submitted") {
    return NextResponse.json({ error: "bundle_not_issued" }, { status: 409 });
  }

  // The requested streams must be a subset of the bundle's scoped streams
  // (empty = all streams in the bundle).
  const scopeRows = await prisma.affirmBundleScopeItem.findMany({
    where: { bundleId: id },
    select: { scopeItem: { select: { streamId: true } } },
  });
  const bundleStreams = new Set(scopeRows.map((r) => r.scopeItem.streamId));
  const badStream = valueStreamIds.find((s) => !bundleStreams.has(s));
  if (badStream) return NextResponse.json({ error: "stream_out_of_scope" }, { status: 422 });

  const { grant, rawToken } = await createGrant({
    bundleId: id,
    email,
    displayName,
    roleLabel,
    valueStreamIds,
    actorId: user.id,
  });

  await dispatchEmail(
    renderAffirmInviteEmail({
      recipientEmail: email,
      displayName,
      roleLabel,
      clientLabel: bundle.client,
      inviteUrl: inviteUrl(req, rawToken),
    }),
    { bestEffort: true },
  );

  return NextResponse.json({ ok: true, grantId: grant.id });
}
