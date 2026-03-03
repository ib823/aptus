/** POST: Create assessment from a hardcoded preset */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { PRESETS, type PresetKey } from "@/constants/presets";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const presetKeys = Object.keys(PRESETS) as [PresetKey, ...PresetKey[]];

const createFromPresetSchema = z.object({
  preset: z.enum(presetKeys),
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  country: z.string().optional(),
  companySize: z.string().optional(),
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant", "admin"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "No organization associated" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = createFromPresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: parsed.error.issues[0]?.message ?? "Validation failed",
        },
      },
      { status: 400 },
    );
  }

  const preset = PRESETS[parsed.data.preset];

  const assessment = await prisma.assessment.create({
    data: {
      companyName: parsed.data.companyName,
      industry: parsed.data.industry ?? "General",
      country: parsed.data.country ?? "XX",
      companySize: parsed.data.companySize ?? "midsize",
      sapModules: [...preset.modules],
      organizationId: user.organizationId,
      createdBy: user.id,
      status: "draft",
    },
  });

  if (preset.scopeItemIds.length > 0) {
    await prisma.scopeSelection.createMany({
      data: preset.scopeItemIds.map((scopeItemId) => ({
        assessmentId: assessment.id,
        scopeItemId,
        selected: true,
        relevance: "YES",
      })),
      skipDuplicates: true,
    });
  }

  await logDecision({
    assessmentId: assessment.id,
    entityType: "assessment",
    entityId: assessment.id,
    action: "ASSESSMENT_FROM_TEMPLATE",
    newValue: {
      preset: parsed.data.preset,
      presetName: preset.name,
      scopeItemCount: preset.scopeItemIds.length,
    },
    actor: user.email,
    actorRole: user.role,
    reason: `Assessment created from preset "${preset.name}"`,
  });

  return NextResponse.json({ data: assessment }, { status: 201 });
}
