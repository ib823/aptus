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

  // Host-aware login redirect. On the Workbench host (ab-workbench.vercel.app)
  // sending users to /login bounces off middleware host-routing (/login is not
  // a Workbench path) → /presales → /presales/login. Skip the round-trip.
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const workbenchHost = process.env.WORKBENCH_HOST?.toLowerCase();
  const isWorkbenchHost = !!workbenchHost && host === workbenchHost;
  const loginPath = isWorkbenchHost ? "/presales/login" : "/login";

  // Diagnostic — log every bridge invocation so production logs surface
  // the exact failure mode when a user reports a sign-in loop. Values
  // are intentionally elided; names + booleans only.
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  const hasNextAuthCookie = cookieNames.some(
    (n) =>
      n === "__Secure-next-auth.session-token" ||
      n === "next-auth.session-token" ||
      n.startsWith("__Secure-next-auth.session-token.") ||
      n.startsWith("next-auth.session-token."),
  );

  const session = await getServerSession(authOptions);
  const userId = (session?.user as Record<string, unknown> | undefined)?.id as string | undefined;

  if (!userId) {
    console.warn("[AUTH/BRIDGE] no userId from getServerSession", {
      host,
      isWorkbenchHost,
      cookieNames,
      hasNextAuthCookie,
      gotSession: !!session,
    });
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, emailVerified: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL(loginPath, request.url));
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
