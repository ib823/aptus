/** Admin invite code management: generate, view, revoke */

import { randomInt } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

const CODE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function generateCode(): string {
  return randomInt(100000, 999999).toString();
}

/** POST: Generate a new 6-digit invite code for a user */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { userId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "User not found" } },
      { status: 404 },
    );
  }

  // Revoke any existing pending codes for this email
  await prisma.inviteCode.updateMany({
    where: { email: target.email, status: "pending" },
    data: { status: "revoked" },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.inviteCode.create({
    data: {
      email: target.email,
      code,
      status: "pending",
      expiresAt,
      issuedBy: auth.user.id,
    },
  });

  return NextResponse.json({
    data: {
      code,
      expiresAt: expiresAt.toISOString(),
      email: target.email,
    },
  }, { status: 201 });
}

/** GET: View active invite code for a user */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { userId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "User not found" } },
      { status: 404 },
    );
  }

  const invite = await prisma.inviteCode.findFirst({
    where: { email: target.email, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  if (!invite || invite.expiresAt < new Date()) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: {
      code: invite.code,
      expiresAt: invite.expiresAt.toISOString(),
      email: target.email,
    },
  });
}

/** DELETE: Revoke invite code for a user */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { userId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "User not found" } },
      { status: 404 },
    );
  }

  await prisma.inviteCode.updateMany({
    where: { email: target.email, status: "pending" },
    data: { status: "revoked" },
  });

  return NextResponse.json({ data: { success: true } });
}
