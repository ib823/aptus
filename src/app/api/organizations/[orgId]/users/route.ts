/** GET: List users in organization */
/** POST: Invite user to organization */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { canAssignRole } from "@/lib/auth/role-permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email(),
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
  const role = mapLegacyRole(user.role);

  // Access: platform_admin (all), partner_lead/client_admin/consultant (own org)
  const canView =
    role === "platform_admin" ||
    (["partner_lead", "client_admin", "consultant"].includes(role) && user.organizationId === orgId);

  if (!canView) {
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

  // Only platform_admin, partner_lead (own org), client_admin (own org)
  const canInvite =
    role === "platform_admin" ||
    ((role === "partner_lead" || role === "client_admin") && user.organizationId === orgId);

  if (!canInvite) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to invite users" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const targetRole = mapLegacyRole(parsed.data.role) as UserRole;

  // Privilege escalation check
  if (!canAssignRole(role, targetRole)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Cannot invite a role above your own level" } },
      { status: 403 },
    );
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

  const invitation = await prisma.orgInvitation.create({
    data: {
      organizationId: orgId,
      email: parsed.data.email,
      role: targetRole,
      invitedBy: user.id,
      token,
      expiresAt,
    },
  });

  await logDecision({
    assessmentId: "SYSTEM",
    entityType: "invitation",
    entityId: invitation.id,
    action: "USER_INVITED",
    newValue: { email: parsed.data.email, role: targetRole, orgId },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: { invitation, magicLinkSent: false } }, { status: 201 });
}
