/** Simple diagnostic endpoint — no auth, no DB, just returns OK */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "unknown",
    timestamp: new Date().toISOString(),
    hasDbUrl: !!process.env.DATABASE_URL,
    hasDirectDbUrl: !!process.env.DIRECT_DATABASE_URL,
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    hasSmtpUser: !!process.env.SMTP_USER,
    nodeEnv: process.env.NODE_ENV,
  });
}
