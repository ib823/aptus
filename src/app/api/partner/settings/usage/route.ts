/** GET: Usage events and aggregated metrics */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";

const ALLOWED_ROLES: UserRole[] = ["partner_lead", "client_admin", "platform_admin"];
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

  if (!hasRole(user, ALLOWED_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No organization associated" } },
      { status: 404 },
    );
  }

  const events = await prisma.usageEvent.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      eventType: true,
      entityId: true,
      metadata: true,
      createdAt: true,
    },
  });

  // Aggregate by event type
  const aggregated: Record<string, number> = {};
  for (const event of events) {
    aggregated[event.eventType] = (aggregated[event.eventType] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      events,
      aggregated,
      total: events.length,
    },
  });
}
