/**
 * POST /api/discovery/sessions — create a session (C7 "Launch session").
 *
 * Consultant-authenticated, flag-gated. Creates the DiscoveryEngagement scoped
 * to the chosen value streams and mints reviewer grants on the Affirm S9
 * pattern. Returns the new session id and, for each reviewer, a one-time invite
 * URL (`/d/{rawToken}`) — surfaced exactly once here, never stored, exactly as
 * the Affirm grants route surfaces `/a/{rawToken}`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";
import {
  createDiscoverySession,
  MAX_REVIEWERS,
  type NewReviewerInput,
} from "@/lib/discovery/workbench/session-create";

export const dynamic = "force-dynamic";

/** `${origin}/d/{rawToken}` — the reviewer's guest entry (mirrors Affirm's /a/). */
function inviteUrl(req: NextRequest, rawToken: string): string {
  const origin = req.nextUrl.origin;
  return `${origin}/d/${rawToken}`;
}

function asReviewers(value: unknown): NewReviewerInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_REVIEWERS) return null;
  const out: NewReviewerInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.email !== "string" || typeof r.displayName !== "string") return null;
    if (r.roleLabel !== undefined && r.roleLabel !== null && typeof r.roleLabel !== "string") return null;
    out.push({ email: r.email, displayName: r.displayName, roleLabel: (r.roleLabel as string | null | undefined) ?? null });
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { client, valueStreamIds, reviewers } = body as Record<string, unknown>;

  if (typeof client !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (valueStreamIds !== undefined && (!Array.isArray(valueStreamIds) || valueStreamIds.some((v) => typeof v !== "string"))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsedReviewers = asReviewers(reviewers);
  if (parsedReviewers === null) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await createDiscoverySession({
    client,
    valueStreamIds: (valueStreamIds as string[] | undefined) ?? [],
    reviewers: parsedReviewers,
    createdById: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    invites: result.invites.map((i) => ({
      email: i.email,
      displayName: i.displayName,
      inviteUrl: inviteUrl(req, i.rawToken),
    })),
  });
}
