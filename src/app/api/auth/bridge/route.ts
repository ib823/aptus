/** GET: Bridge NextAuth JWT session to custom fit-portal-session cookie */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { APP_CONFIG } from "@/constants/config";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const redirectTo = request.nextUrl.searchParams.get("callbackUrl") ?? "/assessments";

  // Get the NextAuth session
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    // No NextAuth session — send to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Look up the user in our User table
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Create a custom session
  const ipAddress =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const token = await createSession(user.id, ipAddress, userAgent);

  // Set the session cookie and redirect
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_CONFIG.sessionMaxAgeHours * 60 * 60,
  });

  return response;
}
