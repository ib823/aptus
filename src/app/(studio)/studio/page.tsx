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

import { TopologyMap } from "@/components/ops/TopologyMap";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canMutateStudio } from "@/lib/studio/rbac";
import { resolveStudioTenants } from "@/lib/studio/tenants";

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

  // Counting SapConnection rows here is what made this page announce "No SAP
  // tenant connected" directly beneath a switcher listing two working tenants:
  // the deployment's env tenants are reachable, and are what every SAP TDD route
  // already reads. Resolve them the same way the rest of Studio does.
  const [solutionCount, tenants] = await Promise.all([
    prisma.solution.count({ where: { organizationId: orgId } }),
    resolveStudioTenants(orgId),
  ]);

  const ownConnections = tenants.filter((t) => t.source === "connection").length;
  const sharedTenants = tenants.filter((t) => t.source === "environment").length;

  const canBuild = canMutateStudio(user.role);

  return (
    <Page>
      <h1 style={h1}>Developer Studio</h1>
      <p style={{ ...body, marginBottom: 24 }}>
        Configure, govern, test and scaffold the integration between your solution and
        this client&apos;s SAP tenant. Your solution&apos;s own application code stays in
        your repository — Studio governs the integration edge.
      </p>

      {/* The graph the individual screens cannot show: what is wired to what.
          Mounted below the intro rather than above it, because a builder with
          nothing registered needs the sentence before the empty canvas. */}
      <div style={{ marginBottom: 24 }}>
        <TopologyMap lens="developer-studio" />
      </div>

      {solutionCount === 0 ? (
        <Card>
          <h2 style={h2}>Register your first solution</h2>
          <p style={body}>
            A solution is the passport for something you are building: what business
            problem it solves, who owns it, and which SAP capabilities it is allowed to
            consume. Nothing is governed until a solution exists.
          </p>
          {canBuild ? (
            <p style={{ ...body, marginTop: 12, marginBottom: 0 }}>
              <a href="/studio/solutions" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
                Register a solution
              </a>{" "}
              to get started.
            </p>
          ) : (
            <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
              Your role can view Studio; registering a solution is a builder action.
            </p>
          )}
          {/*
            The design's first-run card offers a second door — "or explore what
            this tenant can do" — because Discover is the one surface that works
            before anything is registered. Without it this card dead-ends.
          */}
          {tenants.length > 0 ? (
            <p style={{ ...body, marginTop: 12, marginBottom: 0 }}>
              Or{" "}
              <a href="/studio/discover" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
                explore what this tenant can do
              </a>{" "}
              — Discover works before anything is registered.
            </p>
          ) : null}
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Stat label="My solutions" value={solutionCount} />
          <Stat
            label={ownConnections > 0 ? "Connected SAP tenants" : "Shared SAP tenants"}
            value={ownConnections > 0 ? ownConnections : sharedTenants}
          />
        </div>
      )}

      {tenants.length === 0 ? (
        <Card>
          <h2 style={h2}>No SAP tenant connected</h2>
          <p style={body}>
            Studio shows a capability as <strong>Activated</strong> only where a live
            probe against a connected tenant returned 200. Until this organization has a
            SAP connection — or the deployment has one configured — there is nothing to
            probe, so nothing is claimed.
          </p>
        </Card>
      ) : ownConnections === 0 ? (
        <Card>
          <h2 style={h2}>Running on the shared environment tenant</h2>
          <p style={body}>
            This organization has no stored connection, so Studio is using the{" "}
            {sharedTenants === 1 ? "tenant" : `${sharedTenants} tenants`} configured on
            the deployment itself — the same one SAP Explorer reads. It is shared by
            everyone on this deployment, and its credentials live in environment
            variables rather than the sealed store. Add a connection to give this
            organization its own.
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
