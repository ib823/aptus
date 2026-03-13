/** GET: List ALM export records */
/** POST: Create ALM export */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { Prisma } from "@prisma/client";
import { getAlmAdapter } from "@/lib/alm/adapter-factory";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import type { AlmTarget, SnapshotData } from "@/types/signoff";
import { z } from "zod";

const createExportSchema = z.object({
  targetSystem: z.enum(["JIRA", "AZURE_DEVOPS", "SAP_SOLMAN", "CSV"]),
  exportConfig: z.record(z.string(), z.unknown()),
  exportMapping: z.record(z.string(), z.unknown()).optional(),
});
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }

  const exports = await prisma.almExportRecord.findMany({
    where: { assessmentId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: exports });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const allowedRoles = ["platform_admin", "partner_lead", "consultant", "it_lead"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create ALM exports" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = createExportSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Get latest snapshot for export data
  const latestSnapshot = await prisma.assessmentSnapshot.findFirst({
    where: { assessmentId: id },
    orderBy: { version: "desc" },
  });

  const exportRecord = await prisma.almExportRecord.create({
    data: {
      assessmentId: id,
      targetSystem: parsed.data.targetSystem,
      status: "PENDING",
      exportedById: user.id,
      exportConfig: parsed.data.exportConfig as Prisma.InputJsonValue,
      exportMapping: parsed.data.exportMapping ? (parsed.data.exportMapping as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  // Process export asynchronously (fire-and-forget)
  if (latestSnapshot) {
    void (async () => {
      try {
        await prisma.almExportRecord.update({
          where: { id: exportRecord.id },
          data: { status: "IN_PROGRESS" },
        });

        const adapter = await getAlmAdapter(parsed.data.targetSystem as AlmTarget);
        const snapshotData = latestSnapshot.snapshotData as unknown as SnapshotData;
        const config = parsed.data.exportConfig as Record<string, string>;
        const mapping = parsed.data.exportMapping as Record<string, Record<string, string>> | undefined;

        const workItems = adapter.transformToWorkItems(snapshotData, config, mapping);
        const result = await adapter.exportWorkItems(workItems, config);

        await prisma.almExportRecord.update({
          where: { id: exportRecord.id },
          data: {
            status: result.success ? "COMPLETED" : "FAILED",
            resultSummary: result.resultSummary as Prisma.InputJsonValue,
            errorMessage: result.errors.length > 0 ? result.errors.map(e => e.error).join("; ") : null,
          },
        });
      } catch (err) {
        await prisma.almExportRecord.update({
          where: { id: exportRecord.id },
          data: {
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        }).catch((updateErr) => console.error("[ALM-EXPORT] Failed to update export record status:", updateErr));
      }
    })();
  }

  return NextResponse.json({ data: exportRecord }, { status: 201 });
}
