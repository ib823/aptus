/** GET: Config activities catalog */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";
export const maxDuration = 30;

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  area: z.string().optional(),
  subArea: z.string().optional(),
  category: z.enum(["Mandatory", "Recommended", "Optional"]).optional(),
  selfService: z.enum(["true", "false"]).optional(),
  scopeItemId: z.string().optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid query parameters" } },
      { status: 400 },
    );
  }

  const limit = parsed.data.limit;
  const where: Record<string, unknown> = {};

  if (parsed.data.area) where.applicationArea = parsed.data.area;
  if (parsed.data.subArea) where.applicationSubarea = parsed.data.subArea;
  if (parsed.data.category) where.category = parsed.data.category;
  if (parsed.data.selfService !== undefined) where.selfService = parsed.data.selfService === "true";
  if (parsed.data.scopeItemId) where.scopeItemId = parsed.data.scopeItemId;
  if (parsed.data.search) {
    where.OR = [
      { configItemName: { contains: parsed.data.search, mode: "insensitive" } },
      { activityDescription: { contains: parsed.data.search, mode: "insensitive" } },
    ];
  }

  const configs = await prisma.configActivity.findMany({
    where,
    orderBy: [{ category: "asc" }, { configItemName: "asc" }],
    take: limit + 1,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      scopeItemId: true,
      configItemName: true,
      configItemId: true,
      activityDescription: true,
      selfService: true,
      configApproach: true,
      category: true,
      activityId: true,
      applicationArea: true,
      applicationSubarea: true,
      localizationScope: true,
      countrySpecific: true,
      additionalInfo: true,
    },
  });

  const hasMore = configs.length > limit;
  if (hasMore) configs.pop();

  return NextResponse.json({
    data: configs,
    nextCursor: hasMore ? configs[configs.length - 1]?.id ?? null : null,
    hasMore,
  });
}
