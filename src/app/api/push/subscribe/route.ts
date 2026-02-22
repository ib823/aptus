/** POST/DELETE: Manage push notification subscriptions (Phase 27) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const preferredRegion = "sin1";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Invalid subscription data",
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        },
      },
      { status: 400 },
    );
  }

  // Return success with the subscription data.
  // Actual DB storage will come when PushSubscription model is available.
  return NextResponse.json(
    {
      data: {
        endpoint: parsed.data.endpoint,
        userId: user.id,
        subscribed: true,
      },
    },
    { status: 201 },
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Invalid unsubscribe data",
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        },
      },
      { status: 400 },
    );
  }

  // Actual DB deletion will come when PushSubscription model is available.
  return new NextResponse(null, { status: 204 });
}
