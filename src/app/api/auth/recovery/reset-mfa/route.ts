/**
 * TEMPORARY one-time MFA reset endpoint.
 * DELETE THIS FILE after recovery is complete.
 *
 * Usage: POST /api/auth/recovery/reset-mfa
 * Requires a valid session cookie (user must be logged in via magic link).
 * Resets mfaEnabled, mfaMethod, totpSecret, and totpVerified on the user.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export async function POST(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("abeam-session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "No session cookie found. Log in via magic link first." },
        { status: 401 },
      );
    }

    // Find the session and associated user directly
    const session = await prisma.session.findUnique({
      where: { token },
      select: {
        isRevoked: true,
        expiresAt: true,
        user: {
          select: { id: true, email: true, mfaEnabled: true, mfaMethod: true },
        },
      },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Session invalid or expired. Log in again via magic link." },
        { status: 401 },
      );
    }

    const user = session.user;

    // Reset MFA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaMethod: "none",
        totpSecret: null,
        totpVerified: false,
      },
    });

    // Also mark session as MFA verified so portal layout doesn't redirect
    await prisma.session.update({
      where: { token },
      data: { mfaVerified: true, mfaVerifiedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: `MFA reset for ${user.email}. Refresh the page to access the portal. DELETE this endpoint immediately.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Recovery failed: ${message}` },
      { status: 500 },
    );
  }
}
