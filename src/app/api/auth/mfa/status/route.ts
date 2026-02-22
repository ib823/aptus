/** GET: Get current MFA enrollment status */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ERROR_CODES } from "@/types/api";
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  return NextResponse.json({
    data: {
      mfaEnabled: user.mfaEnabled,
      totpVerified: user.totpVerified,
      mfaVerified: user.mfaVerified,
      role: user.role,
    },
  });
}
