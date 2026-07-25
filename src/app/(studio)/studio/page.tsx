/**
 * Home / Mission Control — the Developer Studio landing.
 *
 * HONEST BY CONSTRUCTION: every number on this page comes from a real,
 * organization-scoped query. Cards whose data source has not shipped yet are not
 * rendered as zeroes or placeholders — a "0 failing tests" tile backed by nothing
 * is a lie, and the whole console's credibility rests on never telling one. They
 * appear as their PRs land.
 */

import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canMutateStudio } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home" };

export default async function StudioHomePage() {
  // The layout has already enforced auth, the role gate, and tenant scope; this
  // re-reads the session rather than trusting anything passed down.
  const user = await getCurrentUser();
  if (!user) return null;

  const orgId = user.organizationId;

  // A platform_admin may legitimately carry a null organization. Rather than
  // widen the query across tenants, say plainly that there is no tenant context.
  if (!orgId) {
    return (
      <Page>
        <h1 style={h1}>Developer Studio</h1>
        <Card>
          <h2 style={h2}>No organization context</h2>
          <p style={body}>
            Your account is not attached to an organization, so there is no tenant to
            scope solutions and connections to. Open Studio from an organization
            account to see its governed integrations.
          </p>
        </Card>
      </Page>
    );
  }

  const [solutionCount, connectionCount] = await Promise.all([
    prisma.solution.count({ where: { organizationId: orgId } }),
    prisma.sapConnection.count({ where: { organizationId: orgId, isActive: true } }),
  ]);

  const canBuild = canMutateStudio(user.role);

  return (
    <Page>
      <h1 style={h1}>Developer Studio</h1>
      <p style={{ ...body, marginBottom: 24 }}>
        Configure, govern, test and scaffold the integration between your solution and
        this client&apos;s SAP tenant. Your solution&apos;s own application code stays in
        your repository — Studio governs the integration edge.
      </p>

      {solutionCount === 0 ? (
        <Card>
          <h2 style={h2}>Register your first solution</h2>
          <p style={body}>
            A solution is the passport for something you are building: what business
            problem it solves, who owns it, and which SAP capabilities it is allowed to
            consume. Nothing is governed until a solution exists.
          </p>
          {canBuild ? (
            <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
              Solution registration ships with the Solutions section.
            </p>
          ) : (
            <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
              Your role can view Studio; registering a solution is a builder action.
            </p>
          )}
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Stat label="My solutions" value={solutionCount} />
          <Stat label="Connected SAP tenants" value={connectionCount} />
        </div>
      )}

      {solutionCount === 0 && connectionCount === 0 ? (
        <Card>
          <h2 style={h2}>No SAP tenant connected</h2>
          <p style={body}>
            Studio shows a capability as <strong>Activated</strong> only where a live
            probe against a connected tenant returned 200. Until this organization has a
            SAP connection, there is nothing to probe — so nothing is claimed.
          </p>
        </Card>
      ) : null}
    </Page>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function Page({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section
      style={{
        background: "var(--surface-paper)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card-warm, 12px)",
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
        padding: 20,
      }}
    >
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 32, lineHeight: "40px", fontWeight: 600 }}>{value}</div>
    </Card>
  );
}

const h1: React.CSSProperties = { margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" };
const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: 16, lineHeight: "24px", fontWeight: 600 };
const body: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" };
const muted: React.CSSProperties = { fontSize: 13, lineHeight: "20px", color: "var(--ink-muted)" };
