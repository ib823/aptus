/** GET: List users in organization */
/** POST: Invite user to organization */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import {
  DEVELOPER_WORKSPACE_INVITE_WINDOW_MS,
  inviteSendBudget,
  mayManageOrgMembers,
  mayViewOrgMembers,
  pendingInvitesCountAsSeats,
  refuseInviteRole,
} from "@/lib/auth/org-invites";
import { logDecision } from "@/lib/audit/decision-logger";
import { sendEmail } from "@/lib/email/brevo";
import { orgInvitationEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/db/prisma";
import { checkUserLimit } from "@/lib/commercial/usage-metering";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const inviteSchema = z.object({
  // Lower-cased like every other address on the User table, so the invitation
  // matches the account its recipient signs in as.
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  role: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
});
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { orgId } = await params;

  // Access: platform_admin (all); partner_lead, client_admin, consultant and
  // sandbox_developer (own org) — one list, in lib/auth/org-invites.
  if (!mayViewOrgMembers(user, orgId)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;
  const roleFilter = request.nextUrl.searchParams.get("role") ?? undefined;
  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  const where: Record<string, unknown> = { organizationId: orgId };
  if (roleFilter) where.role = roleFilter;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      mfaEnabled: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  const hasMore = users.length > limit;
  if (hasMore) users.pop();

  return NextResponse.json({
    data: users,
    nextCursor: hasMore ? users[users.length - 1]?.id ?? null : null,
    hasMore,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { orgId } = await params;
  const role = mapLegacyRole(user.role);

  // platform_admin (any org); partner_lead, client_admin and, since P0.13, a
  // sandbox developer — each in its own organization only.
  if (!mayManageOrgMembers(user, orgId)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to invite users" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const targetRole = mapLegacyRole(parsed.data.role) as UserRole;

  // Privilege escalation check: never above your own level, and a developer
  // workspace invites sandbox developers only.
  const roleRefusal = refuseInviteRole(role, targetRole);
  if (roleRefusal) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: roleRefusal } },
      { status: 403 },
    );
  }

  // Enforce the plan's seat limit before minting an invitation. checkUserLimit
  // existed since Phase 29 but nothing called it, so seats were unlimited on
  // every tier in practice. A developer workspace's pending invitations hold a
  // seat too, so an open sign-up cannot mail any number of addresses.
  const seatCheck = await checkUserLimit(orgId);
  if (seatCheck.allowed && pendingInvitesCountAsSeats(role)) {
    const pending = await prisma.orgInvitation.count({
      where: { organizationId: orgId, status: "pending", expiresAt: { gt: new Date() } },
    });
    seatCheck.current += pending;
    seatCheck.allowed = seatCheck.current < seatCheck.limit;
  }
  if (!seatCheck.allowed) {
    console.warn("[API] POST /api/organizations/[orgId]/users rejected: seat limit reached", {
      userId: user.id,
      orgId,
      current: seatCheck.current,
      limit: seatCheck.limit,
    });
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `User seat limit reached (${seatCheck.current}/${seatCheck.limit}). Upgrade your plan.`,
        },
      },
      { status: 400 },
    );
  }

  // A sandbox developer's sends are held to a daily budget that revoking does
  // not refund (lib/auth/org-invites.ts), so the seat rule above cannot be
  // cycled into an open mail relay. Counted from the table, so it holds
  // across instances and restarts.
  const budget = inviteSendBudget(role);
  if (budget !== null) {
    const sentToday = await prisma.orgInvitation.count({
      where: {
        organizationId: orgId,
        role: "sandbox_developer",
        createdAt: { gt: new Date(Date.now() - DEVELOPER_WORKSPACE_INVITE_WINDOW_MS) },
      },
    });
    if (sentToday >= budget) {
      return NextResponse.json(
        {
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: `This workspace has sent its ${budget} invitations for today, including any revoked. Try again tomorrow.`,
          },
        },
        { status: 429 },
      );
    }
  }

  // Check if user already belongs to another org
  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { organizationId: true },
  });
  if (existingUser?.organizationId && existingUser.organizationId !== orgId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "User already belongs to another organization" } },
      { status: 400 },
    );
  }

  // Create invitation
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // One pending invitation per address and organization (a unique index); a
  // second one is a conflict to say, not a 500.
  const alreadyPending = await prisma.orgInvitation.findFirst({
    where: { organizationId: orgId, email: parsed.data.email, status: "pending" },
    select: { id: true },
  });
  if (alreadyPending) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: "That address already has a pending invitation." } },
      { status: 409 },
    );
  }

  // THE TOKEN NEVER LEAVES IN THE RESPONSE. It is the invitee's proof that
  // they hold the mailbox — accepting needs no session — so it goes to that
  // mailbox and nowhere else. This returned the whole row, token included,
  // which let an inviter accept for any address they named; harmless while
  // only administrators could invite, and not once an open sign-up could.
  const invitation = await prisma.orgInvitation.create({
    data: {
      organizationId: orgId,
      email: parsed.data.email,
      role: targetRole,
      invitedBy: user.id,
      token,
      expiresAt,
    },
    select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
  });

  await logDecision({
    assessmentId: null,
    entityType: "invitation",
    entityId: invitation.id,
    action: "USER_INVITED",
    newValue: { email: parsed.data.email, role: targetRole, orgId },
    actor: user.email,
    actorRole: user.role,
  });

  // Send invitation email (fire-and-forget)
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const acceptUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/invitations/${token}`;
  const emailContent = orgInvitationEmail({
    recipientEmail: parsed.data.email,
    inviterName: user.name ?? user.email,
    organizationName: org?.name ?? "your organization",
    role: targetRole,
    acceptUrl,
  });
  sendEmail({
    to: { email: parsed.data.email },
    subject: emailContent.subject,
    htmlContent: emailContent.html,
    textContent: emailContent.text,
    tags: ["org-invitation"],
  }).catch((err) => console.error("[EMAIL] Failed to send org invitation:", err));

  return NextResponse.json({ data: { invitation, magicLinkSent: true } }, { status: 201 });
}
