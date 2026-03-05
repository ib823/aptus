/** GET: List remaining items (cursor paginated). POST: Add manual remaining item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const CATEGORIES = [
  "unreviewed_step", "maybe_scope", "excluded_recommended_config",
  "out_of_scope_gap", "integration_point", "data_migration", "custom_requirement",
] as const;

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});
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

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsedList = listQuerySchema.safeParse(Object.fromEntries(sp.entries()));
  if (!parsedList.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid query parameters" } },
      { status: 400 },
    );
  }
  const { cursor, limit } = parsedList.data;

  const where: Record<string, unknown> = { assessmentId };
  if (sp.get("category")) where.category = sp.get("category");
  if (sp.get("severity")) where.severity = sp.get("severity");
  if (sp.get("scopeItemId")) where.scopeItemId = sp.get("scopeItemId");
  if (sp.get("functionalArea")) where.functionalArea = sp.get("functionalArea");
  if (sp.get("resolved") === "true") where.resolvedAt = { not: null };
  else if (sp.get("resolved") === "false") where.resolvedAt = null;

  const [items, total, resolved, byCategoryRows, bySeverityRows] = await Promise.all([
    prisma.remainingItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.remainingItem.count({ where: { assessmentId } }),
    prisma.remainingItem.count({ where: { assessmentId, resolvedAt: { not: null } } }),
    prisma.remainingItem.groupBy({
      by: ["category"],
      where: { assessmentId },
      _count: { _all: true },
    }),
    prisma.remainingItem.groupBy({
      by: ["severity"],
      where: { assessmentId },
      _count: { _all: true },
    }),
  ]);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const byCategory: Record<string, number> = Object.fromEntries(
    byCategoryRows.map((row) => [row.category, row._count._all]),
  );
  const bySeverity: Record<string, number> = Object.fromEntries(
    bySeverityRows.map((row) => [row.severity, row._count._all]),
  );

  return NextResponse.json({
    data: items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    hasMore,
    summary: {
      total,
      byCategory,
      bySeverity,
      resolved,
      unresolved: total - resolved,
    },
  });
}

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(5).max(255),
  description: z.string().min(10).max(5000),
  severity: z.enum(SEVERITIES),
  scopeItemId: z.string().optional(),
  functionalArea: z.string().optional(),
  assignedTo: z.string().email().optional(),
});

export async function POST(
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

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 },
    );
  }

  const item = await prisma.remainingItem.create({
    data: {
      assessmentId,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity,
      scopeItemId: parsed.data.scopeItemId ?? null,
      functionalArea: parsed.data.functionalArea ?? null,
      assignedTo: parsed.data.assignedTo ?? null,
      autoGenerated: false,
    },
  });

  await logDecision({
    assessmentId,
    entityType: "remaining_item",
    entityId: item.id,
    action: "REMAINING_ITEM_ADDED",
    newValue: { category: item.category, title: item.title, severity: item.severity },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
