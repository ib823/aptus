/** GET: Compare two snapshots (delta report) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeDeltaReport, computeDeltaSummary } from "@/lib/lifecycle/delta-engine";
import type { SnapshotData } from "@/types/signoff";

export const preferredRegion = "sin1";

export async function GET(
  request: NextRequest,
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

  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const baseVersionStr = searchParams.get("baseVersion");
  const compareVersionStr = searchParams.get("compareVersion");

  if (!baseVersionStr || !compareVersionStr) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "baseVersion and compareVersion query params are required" } },
      { status: 400 },
    );
  }

  const baseVersion = parseInt(baseVersionStr, 10);
  const compareVersion = parseInt(compareVersionStr, 10);

  if (isNaN(baseVersion) || isNaN(compareVersion)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Version parameters must be valid integers" } },
      { status: 400 },
    );
  }

  const [baseSnapshot, compareSnapshot] = await Promise.all([
    prisma.assessmentSnapshot.findUnique({
      where: { assessmentId_version: { assessmentId: id, version: baseVersion } },
    }),
    prisma.assessmentSnapshot.findUnique({
      where: { assessmentId_version: { assessmentId: id, version: compareVersion } },
    }),
  ]);

  if (!baseSnapshot) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: `Snapshot version ${baseVersion} not found` } },
      { status: 404 },
    );
  }
  if (!compareSnapshot) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: `Snapshot version ${compareVersion} not found` } },
      { status: 404 },
    );
  }

  const baseData = baseSnapshot.snapshotData as unknown as SnapshotData;
  const compareData = compareSnapshot.snapshotData as unknown as SnapshotData;

  const delta = computeDeltaReport(baseData, compareData);
  delta.baseVersion = baseVersion;
  delta.compareVersion = compareVersion;

  const summary = computeDeltaSummary(delta);

  // Cache the comparison
  await prisma.snapshotComparison.upsert({
    where: {
      baseSnapshotId_compareSnapshotId: {
        baseSnapshotId: baseSnapshot.id,
        compareSnapshotId: compareSnapshot.id,
      },
    },
    create: {
      assessmentId: id,
      baseSnapshotId: baseSnapshot.id,
      compareSnapshotId: compareSnapshot.id,
      deltaReport: delta as object,
      summary: summary as object,
    },
    update: {
      deltaReport: delta as object,
      summary: summary as object,
      computedAt: new Date(),
    },
  });

  return NextResponse.json({ data: { delta, summary } });
}
