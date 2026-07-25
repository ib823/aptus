/**
 * GET /api/studio/connections — the Connections screen's data.
 *
 * A METADATA PROJECTION over SapConnection, and structurally incapable of
 * leaking a secret: the `select` below is an explicit allow-list that does not
 * name `secretsCiphertext`, so the column is never even read out of the database,
 * let alone serialised. Redaction here is not a filter applied on the way out
 * (which someone can forget to apply) — it is the absence of the read.
 *
 * `baseUrl` IS included: it is a non-secret hostname the consultant needs in
 * order to recognise which client system a row points at, and it is only ever
 * shown to a member of that same organization.
 */

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { studioError, studioOk } from "@/lib/studio/api";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (lacksStudioTenantScope(user)) {
    return studioError("FORBIDDEN", "No organization scope.");
  }

  const organizationId = user.organizationId;
  if (!organizationId) return studioOk({ connections: [] });

  const connections = await prisma.sapConnection.findMany({
    where: { organizationId },
    // Explicit allow-list. `secretsCiphertext` is deliberately absent — adding it
    // here is the only way this endpoint could ever expose a secret, and a test
    // asserts it stays absent.
    select: {
      id: true,
      product: true,
      key: true,
      label: true,
      baseUrl: true,
      authType: true,
      writeEnabled: true,
      isActive: true,
      apiPath: true,
      timeoutMs: true,
      lastValidatedAt: true,
      lastValidationStatus: true,
      createdAt: true,
    },
    orderBy: [{ product: "asc" }, { key: "asc" }],
  });

  return studioOk({ connections });
}
