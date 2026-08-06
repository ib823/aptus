import type { Metadata } from "next";

import { CatalogueHealthClient } from "@/components/ops/CatalogueHealthClient";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalogue health" };

/**
 * Deployment-scoped and platform_admin-gated, per FRESHNESS-RESPEC.md. The
 * layout already removes this screen from every other persona's rail; this
 * server-side check is the second lock on the same door, so a hand-typed URL
 * gets the honest refusal rather than a screen whose every fetch 403s.
 */
export default async function CatalogueHealthPage() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return (
      <div style={{ maxWidth: 560, padding: "40px 0" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          Catalogue health is platform-scoped
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-secondary)", marginTop: 10 }}>
          This panel describes the shared SAP catalogue the whole deployment serves from — there is
          no per-organization number on it, which is why it is gated to platform administrators
          rather than scoped to a tenant. Your organization&apos;s own connection health lives in
          Operations → Connections.
        </p>
      </div>
    );
  }
  return <CatalogueHealthClient />;
}
