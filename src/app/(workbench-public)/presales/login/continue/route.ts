/**
 * Workbench magic-link continuation — POST only.
 *
 * The confirm page renders a POST form whose payload is the SEALED callback
 * URL (?c=). A human clicking "Continue" submits that form here; we decrypt,
 * validate same-origin, and 303-redirect to the real single-use NextAuth
 * callback. Because corporate link-scanners (Outlook Safe Links et al.)
 * GET-scan and detonate links but do NOT submit POST forms, the verification
 * token is only ever consumed by the human's click — never by a scanner.
 *
 * GET is a no-op (scanners that probe this endpoint get nothing useful).
 */

import { NextResponse, type NextRequest } from "next/server";
import { openSealedCallbackUrl, isValidCallback } from "@/lib/auth/magic-link-confirm";

export const dynamic = "force-dynamic";

function requestOriginOf(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestOrigin = requestOriginOf(request);

  let sealed: string | null = null;
  try {
    const form = await request.formData();
    const c = form.get("c");
    sealed = typeof c === "string" ? c : null;
  } catch {
    sealed = null;
  }

  const target = sealed ? openSealedCallbackUrl(sealed) : null;

  if (!target || !requestOrigin || !isValidCallback(target, requestOrigin)) {
    // Could not validate — surface a clear reason instead of a blank bounce.
    return NextResponse.redirect(
      new URL("/presales/login?error=Verification", request.url),
      303,
    );
  }

  // Human-initiated POST → now (and only now) hit the single-use callback.
  // 303 forces the follow-up to be a GET, which is what NextAuth expects.
  return NextResponse.redirect(target, 303);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.redirect(new URL("/presales/login", request.url), 303);
}
