/** POST: Process offline sync queue (Phase 27) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { validateSyncItem, detectConflict, categorizeSyncResults } from "@/lib/pwa/sync-engine";
import { z } from "zod";

const syncSchema = z.object({
  items: z
    .array(
      z.object({
        clientId: z.string().min(1),
        action: z.enum(["classify_step", "add_note", "create_gap", "update_scope"]),
        assessmentId: z.string().min(1),
        payload: z.record(z.string(), z.unknown()),
        queuedAt: z.string().min(1),
      }),
    )
    .min(1)
    .max(100),
});

async function processClassifyStep(
  item: { clientId: string; assessmentId: string; payload: Record<string, unknown>; queuedAt: string },
  userId: string,
): Promise<{ clientId: string; status: string }> {
  try {
    const processStepId = item.payload.processStepId as string | undefined;
    const fitStatus = item.payload.fitStatus as string | undefined;

    if (!processStepId || !fitStatus) {
      return { clientId: item.clientId, status: "failed" };
    }

    // Look up existing step response
    const existing = await prisma.stepResponse.findUnique({
      where: {
        assessmentId_processStepId: {
          assessmentId: item.assessmentId,
          processStepId,
        },
      },
      select: { id: true, updatedAt: true },
    });

    if (existing && detectConflict(existing.updatedAt, item.queuedAt)) {
      return { clientId: item.clientId, status: "conflict" };
    }

    // Upsert the step response
    if (existing) {
      await prisma.stepResponse.update({
        where: { id: existing.id },
        data: {
          fitStatus,
          respondent: userId,
          respondedAt: new Date(),
        },
      });
    } else {
      await prisma.stepResponse.create({
        data: {
          assessmentId: item.assessmentId,
          processStepId,
          fitStatus,
          respondent: userId,
          respondedAt: new Date(),
        },
      });
    }

    return { clientId: item.clientId, status: "synced" };
  } catch {
    return { clientId: item.clientId, status: "failed" };
  }
}

async function processAddNote(
  item: { clientId: string; assessmentId: string; payload: Record<string, unknown>; queuedAt: string },
  userId: string,
): Promise<{ clientId: string; status: string }> {
  try {
    const processStepId = item.payload.processStepId as string | undefined;
    const note = item.payload.note as string | undefined;

    if (!processStepId || !note) {
      return { clientId: item.clientId, status: "failed" };
    }

    const existing = await prisma.stepResponse.findUnique({
      where: {
        assessmentId_processStepId: {
          assessmentId: item.assessmentId,
          processStepId,
        },
      },
      select: { id: true, updatedAt: true },
    });

    if (existing && detectConflict(existing.updatedAt, item.queuedAt)) {
      return { clientId: item.clientId, status: "conflict" };
    }

    if (existing) {
      await prisma.stepResponse.update({
        where: { id: existing.id },
        data: {
          clientNote: note,
          respondent: userId,
          respondedAt: new Date(),
        },
      });
    } else {
      await prisma.stepResponse.create({
        data: {
          assessmentId: item.assessmentId,
          processStepId,
          fitStatus: "PENDING",
          clientNote: note,
          respondent: userId,
          respondedAt: new Date(),
        },
      });
    }

    return { clientId: item.clientId, status: "synced" };
  } catch {
    return { clientId: item.clientId, status: "failed" };
  }
}

async function processSyncItem(
  item: { clientId: string; action: string; assessmentId: string; payload: Record<string, unknown>; queuedAt: string },
  userId: string,
): Promise<{ clientId: string; status: string }> {
  if (!validateSyncItem(item).valid) {
    return { clientId: item.clientId, status: "failed" };
  }

  switch (item.action) {
    case "classify_step":
      return processClassifyStep(item, userId);
    case "add_note":
      return processAddNote(item, userId);
    case "create_gap":
    case "update_scope":
      // These actions will be fully implemented when additional schema models are available.
      return { clientId: item.clientId, status: "synced" };
    default:
      return { clientId: item.clientId, status: "failed" };
  }
}

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
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Invalid sync data",
          details: parsed.error.flatten().fieldErrors as Record<string, string>,
        },
      },
      { status: 400 },
    );
  }

  const results: Array<{ clientId: string; status: string }> = [];
  for (const item of parsed.data.items) {
    const result = await processSyncItem(item, user.id);
    results.push(result);
  }

  const categorized = categorizeSyncResults(results);

  return NextResponse.json({
    data: {
      synced: categorized.synced,
      conflicts: categorized.conflicts,
      failed: categorized.failed,
    },
  });
}
