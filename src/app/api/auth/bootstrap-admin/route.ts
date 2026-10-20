/**
 * POST /api/auth/bootstrap-admin — claim a fresh instance's first platform
 * admin with the one-time bootstrap token (roadmap P0.13).
 *
 * The rules live in lib/auth/bootstrap.ts. In order: a session (the claimant
 * has proven an email address by signing in), the token (constant time, and
 * configured at all), the governance step-up (`platform.bootstrap`: tokens are
 * refused in every mode, and an enforcing host asks for a passkey), then the
 * serializable claim that re-checks the token and that no admin exists, and
 * records itself. Every refusal is audited.
 *
 * Under /api/auth/ on purpose: it takes the tight per-address auth bucket at
 * the edge, and it is reachable on a WORKBENCH_ONLY host like every auth route.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  BOOTSTRAP_REFUSAL_MESSAGES,
  checkBootstrapToken,
  claimPlatformAdmin,
  recordBootstrapRefusal,
  type BootstrapRefusal,
} from "@/lib/auth/bootstrap";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";

const bodySchema = z.object({ token: z.string().min(1).max(512) });

const REFUSAL_STATUS: Record<BootstrapRefusal, { status: number; code: string }> = {
  NOT_CONFIGURED: { status: 404, code: ERROR_CODES.NOT_FOUND },
  INVALID_TOKEN: { status: 403, code: ERROR_CODES.FORBIDDEN },
  ADMIN_EXISTS: { status: 409, code: ERROR_CODES.CONFLICT },
  TOKEN_USED: { status: 409, code: ERROR_CODES.CONFLICT },
  CONFLICT: { status: 409, code: ERROR_CODES.CONFLICT },
};

function refused(refusal: BootstrapRefusal): NextResponse {
  const { status, code } = REFUSAL_STATUS[refusal];
  return NextResponse.json(
    { error: { code, message: BOOTSTRAP_REFUSAL_MESSAGES[refusal], refusal } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Sign in first, then claim the instance." } },
      { status: 401 },
    );
  }

  const body = await safeParseJsonBody(request);
  const parsed = body.ok ? bodySchema.safeParse(body.data) : null;
  if (!parsed?.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "A bootstrap token is required." } },
      { status: 400 },
    );
  }

  const check = checkBootstrapToken(parsed.data.token);
  if (!check.ok) {
    await recordBootstrapRefusal(user, check.refusal);
    return refused(check.refusal);
  }

  const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
    action: "platform.bootstrap",
    targetId: user.id,
  });
  if (!stepUp.ok) return stepUp.response;

  const claim = await claimPlatformAdmin(user, parsed.data.token);
  if (!claim.ok) return refused(claim.refusal);

  return NextResponse.json(
    { data: { role: "platform_admin" } },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
