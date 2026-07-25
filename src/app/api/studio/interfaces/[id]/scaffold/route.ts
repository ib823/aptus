/**
 * GET /api/studio/interfaces/[id]/scaffold — download the scaffold artifacts.
 *
 * Returns plain files as JSON so the browser can offer each as a download. No
 * archive library is pulled in for four small text files, and no in-browser
 * editor exists — this is code you take to YOUR repository.
 *
 * The artifacts are rendered from the interface's governed configuration by pure
 * functions in lib/studio/scaffold.ts, which is where they are tested.
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { buildScaffold } from "@/lib/studio/scaffold";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const organizationId = user.organizationId;
  if (!organizationId) return studioError("FORBIDDEN", "No organization scope.");

  const { id } = await ctx.params;

  const iface = await prisma.interface.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      name: true,
      externalId: true,
      sapProduct: true,
      operation: true,
      entitySet: true,
      version: true,
      solution: { select: { name: true } },
    },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  // The base URL the generated client will call. Derived from the request so the
  // artifact works against whatever host the developer is actually using.
  const baseUrl = `${request.nextUrl.origin}/api/northbound`;

  const files = buildScaffold(
    {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      operation: iface.operation,
      entitySet: iface.entitySet,
      version: iface.version,
      solutionName: iface.solution.name,
    },
    baseUrl,
  );

  return studioOk({ files });
}
