/** GET: Data migration dependency graph */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id: assessmentId } = await params;

  const objects = await prisma.dataMigrationObject.findMany({
    where: { assessmentId },
    select: {
      id: true,
      objectName: true,
      objectType: true,
      status: true,
      dependsOn: true,
    },
  });

  const nodes = objects.map((o) => ({
    id: o.id,
    objectName: o.objectName,
    objectType: o.objectType,
    status: o.status,
  }));

  const edges: { from: string; to: string }[] = [];
  for (const obj of objects) {
    for (const depId of obj.dependsOn) {
      edges.push({ from: depId, to: obj.id });
    }
  }

  return NextResponse.json({ data: { nodes, edges } });
}
