"use client";

/**
 * StudioTopBar — the 56px paper top bar.
 *
 * TENANT SWITCHER: the list is resolved from the caller's own Organization on the
 * server — its active SapConnection rows, or the deployment's configured env
 * tenants when it has none. It is NEVER read from the URL or from request input;
 * that is the whole point of the design's copy, "Resolved from your access —
 * never typed into a URL". The selection is persisted in a cookie the server
 * re-reads; it is a view preference, never an authorization input. A server route
 * that trusted this cookie for access control would reintroduce the exact
 * tenant-tampering hole the guardrails forbid.
 *
 * NO ENVIRONMENT BADGE. The design puts a DEV/TEST/PROD chip inside this control,
 * describing the SAP tenant you are pointed at. We shipped it wired to VERCEL_ENV
 * — the console's own deployment environment — which reads, inches from a tenant
 * switcher, as "you are connected to production SAP". That is the most dangerous
 * available misreading, so the badge is gone until there is a per-tenant
 * environment field to back it honestly. No badge beats a wrong one.
 *
 * THE DOT encodes what we actually know: whether this is the organization's own
 * connection or the deployment's shared tenant. The design's dot encodes SAP
 * environment, which we cannot yet source.
 *
 * When the organization has no tenant anywhere we say so plainly rather than
 * inventing a default — an honest empty, consistent with honest status elsewhere.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { STUDIO_SECTIONS } from "./StudioRail";

export interface StudioTenantOption {
  /** SapConnection.key, or the env tenant key — probes are recorded under it. */
  key: string;
  label: string;
  product: string;
  /** "connection" = this organization's own; "environment" = shared deployment. */
  source: "connection" | "environment";
}

export const STUDIO_TENANT_COOKIE = "studio-tenant";

/** Close on outside click or Escape — shared by both popovers. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

export function StudioTopBar({
  tenants,
  activeTenantKey,
  roleLabel,
  userEmail,
}: {
  tenants: readonly StudioTenantOption[];
  activeTenantKey: string | null;
  roleLabel: string;
  userEmail: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [tenantOpen, setTenantOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const tenantRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useDismiss(tenantOpen, () => setTenantOpen(false), tenantRef);
  useDismiss(userOpen, () => setUserOpen(false), userRef);

  // Derived from the real path, so the crumb can never drift from where you are.
  const section = STUDIO_SECTIONS.find((s) => s.href === pathname);
  const breadcrumb =
    section && section.key !== "home"
      ? `Developer Studio · ${section.label}`
      : "Developer Studio";

  function selectTenant(key: string) {
    // A view preference, not an authorization input (see file header).
    document.cookie = `${STUDIO_TENANT_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setTenantOpen(false);
    startTransition(() => router.refresh());
  }

  const active = tenants.find((t) => t.key === activeTenantKey) ?? tenants[0] ?? null;
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
        gap: 12,
        padding: "0 24px",
        position: "relative",
        zIndex: 40,
      }}
    >
      <nav aria-label="Breadcrumb" style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-primary)" }}>
          {breadcrumb}
        </span>
      </nav>

      <div style={{ flex: 1 }} />

      {tenants.length > 0 && active ? (
        <div ref={tenantRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setTenantOpen((o) => !o)}
            disabled={isPending}
            aria-haspopup="listbox"
            aria-expanded={tenantOpen}
            aria-label={`Active tenant: ${active.label}. Choose an authorized tenant.`}
            style={{
              all: "unset",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: "5px 10px",
              fontSize: 12.5,
              fontWeight: 600,
              background: "var(--surface-paper)",
              color: "var(--ink-primary)",
              cursor: isPending ? "progress" : "pointer",
              maxWidth: 320,
            }}
          >
            <Dot source={active.source} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {active.label}
            </span>
            <span aria-hidden style={{ color: "var(--ink-muted)", fontSize: 10 }}>▾</span>
          </button>

          {tenantOpen && (
            <div
              role="listbox"
              aria-label="Authorized tenants"
              style={{
                position: "absolute",
                top: 40,
                right: 0,
                width: 280,
                background: "var(--surface-paper)",
                border: "1px solid var(--border-default)",
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,.08)",
                padding: 8,
                zIndex: 50,
              }}
            >
              <div style={panelHeading}>Authorized tenants</div>
              {tenants.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="option"
                  aria-selected={t.key === active.key}
                  onClick={() => selectTenant(t.key)}
                  style={{
                    all: "unset",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    boxSizing: "border-box",
                    padding: 8,
                    borderRadius: 8,
                    cursor: "pointer",
                    background:
                      t.key === active.key ? "var(--surface-ink-tint)" : "transparent",
                  }}
                >
                  <Dot source={t.source} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: "block" }}>
                      {t.label}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
                      {t.product}
                      {t.source === "environment" ? " · shared environment tenant" : ""}
                    </span>
                  </span>
                  {t.key === active.key && (
                    <span aria-hidden style={{ color: "var(--status-ok, #166534)", fontSize: 12 }}>
                      ✓
                    </span>
                  )}
                </button>
              ))}
              <div
                style={{
                  borderTop: "1px solid var(--border-default)",
                  margin: "6px 0 0",
                  padding: "8px 8px 4px",
                  fontSize: 11,
                  color: "var(--ink-muted)",
                  lineHeight: 1.45,
                }}
              >
                Resolved from your access — never typed into a URL.
              </div>
            </div>
          )}
        </div>
      ) : (
        <span
          style={{ fontSize: 12, color: "var(--ink-muted)" }}
          title="Connect a SAP tenant for this organization, or configure one on the deployment, to see live capability status"
        >
          No SAP tenant connected
        </span>
      )}

      <Badge label={roleLabel} title="Your role in this workspace" />

      <div ref={userRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setUserOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={userOpen}
          aria-label={`Account menu for ${userEmail}`}
          title={userEmail}
          style={{
            all: "unset",
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
            cursor: "pointer",
          }}
        >
          {initials}
        </button>

        {userOpen && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: 38,
              right: 0,
              minWidth: 220,
              background: "var(--surface-paper)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,.08)",
              padding: 8,
              zIndex: 50,
            }}
          >
            <div style={{ ...panelHeading, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              {userEmail}
            </div>
            {/*
              A plain link to the GET logout route, not next-auth's signOut(): that
              route also revokes the server-side session row and clears the
              secure-prefixed NextAuth cookies. Clearing only the latter would let
              the middleware re-mint a session from the surviving JWT — signing the
              user straight back in.
            */}
            <a
              role="menuitem"
              href="/api/auth/logout"
              style={{
                display: "block",
                padding: 8,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink-primary)",
                textDecoration: "none",
              }}
            >
              Sign out
            </a>
          </div>
        )}
      </div>
    </header>
  );
}

/** What we honestly know about a tenant: whose it is, not which SAP env it is. */
function Dot({ source }: { source: StudioTenantOption["source"] }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        flex: "none",
        background:
          source === "connection" ? "var(--brand-navy, #002B5C)" : "var(--ink-muted, #8A8A8A)",
      }}
    />
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

const panelHeading: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-muted)",
  fontWeight: 700,
  padding: "6px 8px 4px",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
