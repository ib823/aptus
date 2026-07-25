"use client";

/**
 * StudioTopBar — the 56px paper top bar.
 *
 * TENANT SWITCHER: the list is resolved from the caller's own Organization on the
 * server (its active SapConnection rows) and passed in. It is NEVER read from the
 * URL or from request input — that is the whole point of the design's copy,
 * "Authorized tenants — resolved from your access, never typed into a URL". The
 * selection is persisted in a cookie the server re-reads; it is a view preference,
 * never an authorization input. A server route that trusted this cookie for access
 * control would reintroduce the exact tenant-tampering hole the guardrails forbid.
 *
 * When the organization has no connected SAP tenant we say so plainly rather than
 * inventing a default — an honest empty, consistent with honest status elsewhere.
 */

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { STUDIO_SECTIONS } from "./StudioRail";

export interface StudioTenantOption {
  /** SapConnection.key — also the key stored probes are recorded under. */
  key: string;
  label: string;
  product: string;
}

export const STUDIO_TENANT_COOKIE = "studio-tenant";

export function StudioTopBar({
  tenants,
  activeTenantKey,
  environment,
  roleLabel,
  userEmail,
}: {
  tenants: readonly StudioTenantOption[];
  activeTenantKey: string | null;
  environment: string;
  roleLabel: string;
  userEmail: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Derived from the real path, so the crumb can never drift from where you are.
  const section = STUDIO_SECTIONS.find((s) => s.href === pathname);
  const breadcrumb =
    section && section.key !== "home"
      ? `Developer Studio · ${section.label}`
      : "Developer Studio";

  function selectTenant(key: string) {
    // A view preference, not an authorization input (see file header).
    document.cookie = `${STUDIO_TENANT_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        background: "var(--surface-paper)",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 24px",
      }}
    >
      <nav aria-label="Breadcrumb" style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-primary)" }}>
          {breadcrumb}
        </span>
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor="studio-tenant" style={srOnly}>
          Authorized tenants — resolved from your access, never typed into a URL
        </label>
        {tenants.length > 0 ? (
          <select
            id="studio-tenant"
            value={activeTenantKey ?? tenants[0]?.key ?? ""}
            disabled={isPending}
            onChange={(e) => selectTenant(e.target.value)}
            title="Authorized tenants — resolved from your access, never typed into a URL"
            style={{
              height: 32,
              borderRadius: "var(--radius-input, 8px)",
              border: "1px solid var(--border-strong)",
              background: "var(--surface-paper)",
              color: "var(--ink-primary)",
              fontSize: 13,
              padding: "0 8px",
              maxWidth: 240,
            }}
          >
            {tenants.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} · {t.product}
              </option>
            ))}
          </select>
        ) : (
          <span
            style={{ fontSize: 12, color: "var(--ink-muted)" }}
            title="Connect a SAP tenant for this organization to see live capability status"
          >
            No SAP tenant connected
          </span>
        )}
      </div>

      <Badge label={environment} title="Deployment environment" />
      <Badge label={roleLabel} title="Your role in this workspace" />

      <span
        aria-label={userEmail}
        title={userEmail}
        style={{
          width: 28,
          height: 28,
          borderRadius: 9999,
          background: "var(--brand-navy-soft)",
          color: "var(--brand-navy)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials}
      </span>
    </header>
  );
}

function Badge({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 8px",
        borderRadius: 6,
        background: "var(--surface-ink-tint)",
        color: "var(--ink-secondary)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
