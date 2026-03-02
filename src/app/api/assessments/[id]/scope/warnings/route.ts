/**
 * GET /api/assessments/{id}/scope/warnings
 *
 * Returns cross-scope dependency warnings for the current scope selection.
 * Identifies scope items that are selected but whose prerequisite scopes are not.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export interface ScopeWarning {
  targetScopeCode: string;
  targetScopeName: string;
  missingScopeCode: string;
  missingScopeName: string;
  businessReason: string;
  direction: string;
  confidence?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { id: assessmentId } = await params;

  // 1. Load selected scope IDs
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedSet = new Set(selections.map((s) => s.scopeItemId));

  if (selectedSet.size === 0) {
    return NextResponse.json({ data: { warnings: [] } });
  }

  // 2. Load all active cross-scope dependencies
  const crossDeps = await prisma.crossScopeDependency.findMany({
    where: { isActive: true },
    select: {
      sourceScopeCode: true,
      targetScopeCode: true,
      direction: true,
      businessReason: true,
    },
  });

  // 3. Load scope item names for display
  const scopeItems = await prisma.scopeItem.findMany({
    select: { id: true, nameClean: true },
  });
  const scopeNames = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  // 4. Find mismatches
  const warnings: ScopeWarning[] = [];
  const seenPairs = new Set<string>();

  for (const dep of crossDeps) {
    // DOWNSTREAM: source is prerequisite of target
    // If target is selected but source is NOT → warning
    if (dep.direction === "DOWNSTREAM" || dep.direction === "BIDIRECTIONAL") {
      if (selectedSet.has(dep.targetScopeCode) && !selectedSet.has(dep.sourceScopeCode)) {
        const key = `${dep.targetScopeCode}:${dep.sourceScopeCode}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          warnings.push({
            targetScopeCode: dep.targetScopeCode,
            targetScopeName: scopeNames.get(dep.targetScopeCode) ?? dep.targetScopeCode,
            missingScopeCode: dep.sourceScopeCode,
            missingScopeName: scopeNames.get(dep.sourceScopeCode) ?? dep.sourceScopeCode,
            businessReason: dep.businessReason,
            direction: dep.direction,
          });
        }
      }
    }

    // BIDIRECTIONAL: also check reverse direction
    if (dep.direction === "BIDIRECTIONAL") {
      if (selectedSet.has(dep.sourceScopeCode) && !selectedSet.has(dep.targetScopeCode)) {
        const key = `${dep.sourceScopeCode}:${dep.targetScopeCode}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          warnings.push({
            targetScopeCode: dep.sourceScopeCode,
            targetScopeName: scopeNames.get(dep.sourceScopeCode) ?? dep.sourceScopeCode,
            missingScopeCode: dep.targetScopeCode,
            missingScopeName: scopeNames.get(dep.targetScopeCode) ?? dep.targetScopeCode,
            businessReason: dep.businessReason,
            direction: dep.direction,
          });
        }
      }
    }

    // UPSTREAM: target is prerequisite of source
    if (dep.direction === "UPSTREAM") {
      if (selectedSet.has(dep.sourceScopeCode) && !selectedSet.has(dep.targetScopeCode)) {
        const key = `${dep.sourceScopeCode}:${dep.targetScopeCode}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          warnings.push({
            targetScopeCode: dep.sourceScopeCode,
            targetScopeName: scopeNames.get(dep.sourceScopeCode) ?? dep.sourceScopeCode,
            missingScopeCode: dep.targetScopeCode,
            missingScopeName: scopeNames.get(dep.targetScopeCode) ?? dep.targetScopeCode,
            businessReason: dep.businessReason,
            direction: dep.direction,
          });
        }
      }
    }
  }

  // 5. Group by target scope and deduplicate
  return NextResponse.json({
    data: {
      warnings,
      warningCount: warnings.length,
      selectedCount: selectedSet.size,
    },
  });
}
