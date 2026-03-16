/**
 * TEMPORARY one-time MFA reset endpoint.
 * DELETE THIS FILE after recovery is complete.
 *
 * Usage: POST /api/auth/recovery/reset-mfa
 * Requires a valid session cookie (user must be logged in via magic link).
 * Resets mfaEnabled, mfaMethod, totpSecret, and totpVerified on the user.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated. Log in via magic link first." },
      { status: 401 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: false,
      mfaMethod: "none",
      totpSecret: null,
      totpVerified: false,
    },
  });

  return NextResponse.json({
    success: true,
    message: `MFA reset for ${user.email}. You can now access the portal. DELETE this endpoint immediately.`,
  });
}
