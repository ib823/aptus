/** POST/DELETE: Manage push notification subscriptions */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
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
        },
      },
      { status: 400 },
    );
  }

  await prisma.pushSubscription.upsert({
    where: {
      userId_endpoint: {
        userId: user.id,
        endpoint: parsed.data.endpoint,
      },
    },
    update: {
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    create: {
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
  });

  return NextResponse.json(
    { data: { subscribed: true } },
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
        },
      },
      { status: 400 },
    );
  }

  await prisma.pushSubscription.deleteMany({
    where: {
      userId: user.id,
      endpoint: parsed.data.endpoint,
    },
  });

  return NextResponse.json({ data: { unsubscribed: true } });
}
