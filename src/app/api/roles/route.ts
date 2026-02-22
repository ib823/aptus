/** GET: Return all roles with labels and capabilities */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ERROR_CODES } from "@/types/api";
import { ROLE_LABELS, ROLE_HIERARCHY } from "@/types/assessment";
import { ROLE_CAPABILITIES, ALL_ROLES } from "@/lib/auth/role-permissions";
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const roles = ALL_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    hierarchy: ROLE_HIERARCHY[role],
    capabilities: ROLE_CAPABILITIES[role],
  }));

  return NextResponse.json({ data: roles });
}
