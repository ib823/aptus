/**
 * Discover / Capability Explorer — /studio/discover
 *
 * Server half: resolves the caller's own solutions (for the "Add to interface"
 * picker) and whether they may author at all. The catalogue itself is fetched by
 * the reused client component, through the existing rate-limited SAP routes, so
 * no live SAP call happens while this page renders — rows load only when a row is
 * opened, and only through the throttle.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DiscoverClient } from "@/components/studio/DiscoverClient";
import { ScopeNote } from "@/components/studio/ScopeNote";
import { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenants";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canMutateStudio } from "@/lib/studio/rbac";
import { pickActiveTenant, resolveStudioTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Discover" };

export default async function StudioDiscoverPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;
  const [solutions, tenants] = await Promise.all([
    organizationId
      ? prisma.solution.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    resolveStudioTenants(organizationId),
  ]);

  // This page is genuinely tenant-specific — its heading claims to show what THIS
  // tenant exposes, and probe results are stored per tenant key. It previously
  // hardcoded product="s4hana" and sent no tenant at all, so it reported the
  // deployment's first configured tenant under whatever name the switcher showed.
  const remembered = (await cookies()).get(STUDIO_TENANT_COOKIE)?.value ?? null;
  const tenantKey = pickActiveTenant(tenants, remembered);
  const activeTenant = tenants.find((t) => t.key === tenantKey) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Discover
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          What this tenant actually exposes. A capability is shown as Activated only where a
          live probe returned 200 — an empty result, a missing communication arrangement and
          an error are three different things, and this page keeps them apart.
        </p>
      </div>
      {/* The likeliest place to assume CoreEdge builds ABAP: right where an
          ABAP-exposed OData service shows up alongside standard SAP APIs. */}
      <ScopeNote topic="abap" />
      <DiscoverClient
        solutions={solutions}
        canAuthor={canMutateStudio(user.role)}
        tenant={tenantKey}
        product={activeTenant?.product ?? "s4hana"}
      />
    </div>
  );
}
