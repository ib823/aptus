/** GET: Bridge NextAuth JWT session to custom abeam-session cookie */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import { notifyNewLogin, notifySessionDisplaced } from "@/lib/auth/login-notify";
import { prisma } from "@/lib/db/prisma";
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rawCallback = request.nextUrl.searchParams.get("callbackUrl") ?? "/assessments";
  // Prevent open redirect — only allow relative paths
  const redirectTo = rawCallback.startsWith("/") && !rawCallback.startsWith("//")
    ? rawCallback
    : "/assessments";

  // Get the NextAuth session (server-side only — uses JWT, not the public endpoint)
  const session = await getServerSession(authOptions);
  const userId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;

  if (!userId) {
    // No NextAuth session — send to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify the user is still active
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, emailVerified: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Clicking a magic link proves the user controls the inbox — record it
  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
  }

  // Create a custom session — use first IP from X-Forwarded-For (leftmost = client)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor
    ? (forwardedFor.split(",")[0]?.trim() ?? null)
    : (request.headers.get("x-real-ip") ?? null);
  const userAgent = request.headers.get("user-agent") ?? null;
  const { token, hadExistingSession } = await createSession(user.id, ipAddress, userAgent);

  // Fire-and-forget login notifications
  notifyNewLogin({ userId: user.id, ipAddress, userAgent, loginMethod: "magic link" });
  if (hadExistingSession) {
    notifySessionDisplaced({ userId: user.id, newIpAddress: ipAddress, newUserAgent: userAgent });
  }

  // Set the session cookie and redirect
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(),
  });

  return response;
}
