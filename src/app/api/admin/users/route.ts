/** POST: Admin creates a new user */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { sendMagicLink } from "@/lib/auth/send-magic-link";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ROLE_LABELS } from "@/types/assessment";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const validRoles = Object.keys(ROLE_LABELS) as [string, ...string[]];

const createUserSchema = z.object({
  email: z.string().trim().min(1).max(320).email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1).max(200),
  role: z.enum(validRoles),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = createUserSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { email, name, role } = parsed.data;

  // Check if email already exists
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "A user with this email already exists" } },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      invitedBy: auth.user.id,
      invitedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // Email the new user a magic-link sign-in URL
  const { sent } = await sendMagicLink(email);

  return NextResponse.json({
    data: {
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      emailSent: sent,
    },
  }, { status: 201 });
}
