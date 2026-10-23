/**
 * GET /api/studio/tenant-services?product=&tenant= — the services a
 * connection's Gateway catalogue listed when someone last read it, as stored
 * (roadmap P1.2). Discover's "On this tenant" tab opens on this.
 *
 * NO SAP CALL, NO sapLive SLOT. It reads the database only, so it is a Studio
 * route and takes the ordinary read bucket; the live listing is
 * POST /api/sap/tdd/tenant-services, a console read in the sapLive bucket.
 * Kept on its own path because the edge's live-SAP predicate is a pure
 * pathname test (rate-limit.ts isLiveSapTenantRoute): on the live route's path
 * every visit to the tab would spend a live slot.
 *
 * Organisation-scoped: the connection is looked up within the caller's
 * organisation, and so is the listing. A deployment tenant's listing is never
 * stored (tenant-listing.ts), so its answer says so. A sandbox developer sees
 * Sandbox connections only, as the console lets it read them.
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { scenariosForServices } from "@/lib/sap-public/comm-scenarios";
import { getSapProduct, getSapTenant } from "@/lib/sap-public/tdd-connector";
import { catalogueStatusSentence, groupListing, sourceIdOf } from "@/lib/sap-public/tenant-discovery";
import { productHasGatewayCatalogue, readListing, SCENARIO_TABLE_PRODUCT, v4CatalogueAllowed } from "@/lib/sap-public/tenant-listing";
import { studioError, studioOk } from "@/lib/studio/api";
import { canAccessStudio, isSandboxDeveloper, isStudioBuilder, lacksStudioTenantScope } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");

  const product = getSapProduct(request.nextUrl.searchParams.get("product"));
  if (!product) return studioError("VALIDATION_ERROR", "Unknown product.");
  const key = request.nextUrl.searchParams.get("tenant") ?? "";
  if (!key) return studioError("VALIDATION_ERROR", "Choose a tenant.");
  const isAdmin = isAdminRole(user.role ?? "");
  const listable = productHasGatewayCatalogue(product.key);
  const base = { product: product.key, listable, v4Allowed: v4CatalogueAllowed(product.key) };

  const connection = user.organizationId
    ? await prisma.sapConnection.findFirst({
        where: { organizationId: user.organizationId, product: product.key, key, isActive: true },
        select: { id: true, label: true, revision: true, environment: true },
      })
    : null;
  if (!connection) {
    if (getSapTenant(product.envPrefix, key)) {
      return studioOk({
        ...base,
        source: "deployment" as const,
        listing: null,
        mayList: listable && isAdmin,
        note: "A deployment-wide tenant is shared by every organization here, so its service list is never stored. A platform admin can read it live.",
      });
    }
    return studioError("NOT_FOUND", "No active connection with this key in your organization.");
  }
  if (isSandboxDeveloper(user.role) && connection.environment !== "SANDBOX") {
    return studioError("FORBIDDEN", "A developer workspace reads Sandbox systems only.");
  }

  const listing = await readListing(user.organizationId!, connection);
  const mayList = listable && (isAdmin || isStudioBuilder(user.role));
  if (!listing) {
    return studioOk({ ...base, source: "connection" as const, connection: { label: connection.label }, listing: null, mayList });
  }
  // Who listed it, and the scenarios' names and sizes for the Published rows.
  const published = listing.entries.filter((e) => e.class === "PUBLISHED");
  const [listedBy, join] = await Promise.all([
    prisma.user.findFirst({ where: { id: listing.listedById }, select: { name: true, email: true } }),
    product.key === SCENARIO_TABLE_PRODUCT && published.length > 0
      ? scenariosForServices(prisma, published.map(sourceIdOf))
      : Promise.resolve({ release: null, byId: new Map() }),
  ]);
  const scenarios = Object.fromEntries(
    [...join.byId.values()].flat().map((s) => [s.id, { name: s.name, interfaceCount: s.interfaceCount }]),
  );
  return studioOk({
    ...base,
    source: "connection" as const,
    connection: { label: connection.label },
    mayList,
    listing: {
      listedAt: listing.listedAt.toISOString(),
      listedBy: listedBy?.name ?? listedBy?.email ?? null,
      correlationId: listing.correlationId,
      catalogueStatus: listing.catalogueStatus,
      v4Status: listing.v4Status,
      sentence: catalogueStatusSentence(listing.catalogueStatus),
      truncated: listing.truncated,
      entryCount: listing.entryCount,
      connectionChanged: listing.connectionChanged,
      groups: groupListing(listing.entries),
      scenarios,
      scenarioRelease: join.release,
    },
  });
}
