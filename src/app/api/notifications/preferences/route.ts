/** GET/PUT: Notification preferences for the current user */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ALL_NOTIFICATION_TYPES } from "@/types/notification";

const UpdatePreferenceSchema = z.object({
  notificationType: z.string().min(1),
  channelEmail: z.boolean().optional(),
  channelInApp: z.boolean().optional(),
  channelPush: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
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

  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: user.id },
  });

  // Build a full list with defaults for types that have no saved preference
  const prefMap = new Map(preferences.map((p) => [p.notificationType, p]));
  const fullPreferences = ALL_NOTIFICATION_TYPES.map((type) => {
    const saved = prefMap.get(type);
    if (saved) return saved;
    return {
      id: null,
      userId: user.id,
      notificationType: type,
      channelEmail: true,
      channelInApp: true,
      channelPush: false,
    };
  });

  return NextResponse.json({ data: fullPreferences });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
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

  const body = await request.json();
  const parsed = UpdatePreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as unknown as Record<string, string> } },
      { status: 400 },
    );
  }

  const { notificationType, channelEmail, channelInApp, channelPush } = parsed.data;

  const updated = await prisma.notificationPreference.upsert({
    where: {
      userId_notificationType: { userId: user.id, notificationType },
    },
    create: {
      userId: user.id,
      notificationType,
      channelEmail: channelEmail ?? true,
      channelInApp: channelInApp ?? true,
      channelPush: channelPush ?? false,
    },
    update: {
      ...(channelEmail !== undefined ? { channelEmail } : {}),
      ...(channelInApp !== undefined ? { channelInApp } : {}),
      ...(channelPush !== undefined ? { channelPush } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}
