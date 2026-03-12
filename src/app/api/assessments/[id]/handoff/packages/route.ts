/** GET: List handoff packages */
/** POST: Generate a handoff package */

import { NextResponse, type NextRequest } from "next/server";
import archiver from "archiver";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import type { SnapshotData } from "@/types/signoff";
import { z } from "zod";

const createPackageSchema = z.object({
  snapshotVersion: z.number().int().min(1),
  packageType: z.enum(["FULL", "SCOPE_ONLY", "TECHNICAL", "EXECUTIVE_SUMMARY"]).optional(),
  contents: z.array(z.string()).min(1, "At least one content item is required"),
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

  const packages = await prisma.handoffPackage.findMany({
    where: { assessmentId: id },
    orderBy: { generatedAt: "desc" },
  });

  return NextResponse.json({ data: packages });
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
  const { user, assessment } = access;

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to generate handoff packages" } },
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

  const parsed = createPackageSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Verify snapshot exists
  const snapshot = await prisma.assessmentSnapshot.findUnique({
    where: {
      assessmentId_version: {
        assessmentId: id,
        version: parsed.data.snapshotVersion,
      },
    },
  });
  if (!snapshot) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Snapshot version not found" } },
      { status: 404 },
    );
  }

  const handoffPackage = await prisma.handoffPackage.create({
    data: {
      assessmentId: id,
      snapshotVersion: parsed.data.snapshotVersion,
      packageType: parsed.data.packageType ?? "FULL",
      contents: parsed.data.contents,
      generatedById: user.id,
    },
  });

  // Generate ZIP in background (fire-and-forget)
  void (async () => {
    try {
      const snapshotData = snapshot.snapshotData as unknown as SnapshotData;

      const archive = archiver("zip", { zlib: { level: 6 } });
      const chunks: Uint8Array[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));

      // Add snapshot data as JSON
      archive.append(JSON.stringify(snapshotData, null, 2), {
        name: "snapshot-data.json",
      });

      // Add a summary README
      const readme = [
        `Handoff Package — ${assessment.companyName ?? "Assessment"}`,
        `Snapshot Version: ${parsed.data.snapshotVersion}`,
        `Package Type: ${parsed.data.packageType ?? "FULL"}`,
        `Generated: ${new Date().toISOString()}`,
        "",
        "Contents:",
        ...parsed.data.contents.map((c, i) => `  ${i + 1}. ${c}`),
        "",
        `Statistics:`,
        `  Scope Items: ${snapshotData.statistics.selectedScopeItems} / ${snapshotData.statistics.totalScopeItems}`,
        `  Steps: ${snapshotData.statistics.totalSteps} (FIT: ${snapshotData.statistics.fitCount}, GAP: ${snapshotData.statistics.gapCount})`,
        `  Gap Resolutions: ${snapshotData.statistics.totalGapResolutions}`,
        `  Integrations: ${snapshotData.statistics.integrationPointCount}`,
        `  Data Migration Objects: ${snapshotData.statistics.dataMigrationObjectCount}`,
      ].join("\n");
      archive.append(readme, { name: "README.txt" });

      // Add gap resolutions as CSV
      if (snapshotData.gapResolutions.length > 0) {
        const gapCsv = [
          "ID,Scope Item,Process Step,Type,Description,Priority,Risk,Approved",
          ...snapshotData.gapResolutions.map(g =>
            [g.id, g.scopeItemId, g.processStepId, g.resolutionType,
             `"${g.resolutionDescription.replace(/"/g, '""')}"`,
             g.priority ?? "", g.riskCategory ?? "", g.clientApproved].join(","),
          ),
        ].join("\n");
        archive.append(gapCsv, { name: "gap-resolutions.csv" });
      }

      // Add integration points as CSV
      if (snapshotData.integrationPoints.length > 0) {
        const intCsv = [
          "ID,Name,Direction,Source,Target,Type,Status",
          ...snapshotData.integrationPoints.map(i =>
            [i.id, `"${i.name}"`, i.direction, i.sourceSystem, i.targetSystem, i.interfaceType, i.status].join(","),
          ),
        ].join("\n");
        archive.append(intCsv, { name: "integration-points.csv" });
      }

      // Add data migration objects as CSV
      if (snapshotData.dataMigrationObjects.length > 0) {
        const dmCsv = [
          "ID,Name,Type,Source,Status",
          ...snapshotData.dataMigrationObjects.map(d =>
            [d.id, `"${d.objectName}"`, d.objectType, d.sourceSystem, d.status].join(","),
          ),
        ].join("\n");
        archive.append(dmCsv, { name: "data-migration-objects.csv" });
      }

      await archive.finalize();
      const zipBuffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
      const base64Zip = zipBuffer.toString("base64");

      await prisma.handoffPackage.update({
        where: { id: handoffPackage.id },
        data: {
          blobUrl: `data:application/zip;base64,${base64Zip}`,
          fileSize: zipBuffer.length,
        },
      });
    } catch {
      // ZIP generation is non-blocking
    }
  })();

  return NextResponse.json({ data: handoffPackage }, { status: 201 });
}
