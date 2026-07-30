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
 * THE ENVIRONMENT CHIP sits inside this control, describing the SAP tenant you
 * are pointed at — never the console's own deployment. It was once wired to
 * VERCEL_ENV, which read, inches from a tenant switcher, as "you are connected to
 * production SAP"; that is the most dangerous available misreading, and it is why
 * this now renders SapConnection.environment (or the tenant's declared
 * environment in {PREFIX}_TENANTS_JSON) and nothing else.
 *
 * A tenant with no declared environment gets NO CHIP. Defaulting to "DEV" would
 * put a guess on the one control whose job is to stop an accidental write to
 * production. PROD is styled as a warning because that is the case where being
 * noticed matters.
 *
 * THE DOT encodes something the design's dot does not: whether this is the
 * organization's own sealed connection or the deployment's shared tenant. The
 * environment lives in the chip beside it, so the two facts stay separable —
 * "someone else's DEV" and "your own DEV" are different situations.
 *
 * When the organization has no tenant anywhere we say so plainly rather than
 * inventing a default — an honest empty, consistent with honest status elsewhere.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { manualSlugForPath } from "@/lib/help/manual";
import type { StudioSection } from "@/lib/studio/sections";
import { ProductLabel } from "@/components/sap/ProductLabel";

export interface StudioTenantOption {
  /** SapConnection.key, or the env tenant key — probes are recorded under it. */
  key: string;
  label: string;
  product: string;
  /** "connection" = this organization's own; "environment" = shared deployment. */
  source: "connection" | "environment";
  /** "DEV" | "TEST" | "PROD" | any landscape's own name; null = unknown. */
  environment: string | null;
}

// Owned by @/lib/studio/tenants — servers read this cookie, and a value defined
// in a `"use client"` module reaches them as a client reference, not a string.
export { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenants";

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
  sections,
  workspaceLabel,
  tenants,
  activeTenantKey,
  roleLabel,
  userEmail,
}: {
  /** The ACTIVE workspace's sections — see the breadcrumb note below. */
  sections: readonly StudioSection[];
  workspaceLabel: string;
  tenants: readonly StudioTenantOption[];
  activeTenantKey: string | null;
  roleLabel: string;
  userEmail: string;
}) {
  const pathname = usePathname();

  const [tenantOpen, setTenantOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const tenantRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useDismiss(tenantOpen, () => setTenantOpen(false), tenantRef);
  useDismiss(userOpen, () => setUserOpen(false), userRef);

  // Derived from the real path AND the active workspace's own sections.
  //
  // This was `STUDIO_SECTIONS` with a literal "Developer Studio", which was not
  // merely untidy: `find` returns undefined for every /operations/* and
  // /control-tower/* path, so it fell through to the bare literal and the shared
  // top bar announced "Developer Studio" on every page of both other workspaces.
  const manualSlug = manualSlugForPath(pathname);
  const section = sections.find((s) => s.href === pathname);
  const breadcrumb =
    section && section.key !== "home" ? `${workspaceLabel} · ${section.label}` : workspaceLabel;

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

      {/* CONTEXTUAL HELP — the thing that makes the manual part of the product.
          A manual you have to go and find is a manual nobody reads; this lands
          on the page for the screen you are looking at. It renders only when
          there IS a page, so it can never be a link to a guess. */}
      {manualSlug ? (
        <Link
          href={`/help/${manualSlug}`}
          aria-label={`Manual for ${breadcrumb}`}
          title={`What this screen will not tell you`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "1px solid var(--border-default)",
            color: "var(--ink-secondary)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ?
        </Link>
      ) : null}

      {tenants.length > 0 && active ? (
        <div ref={tenantRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setTenantOpen((o) => !o)}
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
              cursor: "pointer",
              maxWidth: 320,
            }}
          >
            <Dot source={active.source} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {active.label}
            </span>
            <EnvChip environment={active.environment} />
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
                <a
                  key={t.key}
                  role="option"
                  aria-selected={t.key === active.key}
                  /*
                   * A LINK, NOT A CLICK HANDLER. The previous version wrote
                   * document.cookie and called router.refresh(), which needs the
                   * cookie write to succeed, the click to land after hydration,
                   * and the refresh to re-read rather than serve a cached
                   * segment. A user reported the tick simply never moving, and
                   * all three were consistent with that. A navigation cannot
                   * half-work.
                   */
                  href={`/api/studio/tenant?key=${encodeURIComponent(t.key)}&next=${encodeURIComponent(pathname)}`}
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
                      {/* Read "s4hana" under every tenant. The switcher is the
                          most-seen surface in the product and it was showing an
                          internal key. */}
                      <ProductLabel product={t.product} size={14} mutedName />
                      {t.source === "environment" ? " · shared environment tenant" : ""}
                    </span>
                  </span>
                  <EnvChip environment={t.environment} />
                  {t.key === active.key && (
                    <span aria-hidden style={{ color: "var(--status-ok, #166534)", fontSize: 12 }}>
                      ✓
                    </span>
                  )}
                </a>
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
                Resolved from your access — never typed into a URL. Applies to
                Discover and Test Console; Solutions, Interfaces and API Access
                are scoped to your organization, not to one tenant.
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

/**
 * The SAP environment this tenant is, when it has said so.
 *
 * Renders NOTHING when unknown. The alternative — defaulting to "DEV" — would put
 * a guess on the control that exists to stop an accidental write to production,
 * and a wrong "DEV" is far more dangerous than no chip at all.
 *
 * PROD is the only one styled as a warning: the others are informational, that
 * one is the reason the chip exists.
 */
function EnvChip({ environment }: { environment: string | null }) {
  if (!environment) return null;
  const isProd = environment.toUpperCase() === "PROD";
  return (
    <span
      title={`SAP environment: ${environment} (not the console's own environment)`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.02em",
        padding: "1px 6px",
        borderRadius: 5,
        flex: "none",
        background: isProd ? "var(--surface-banner-warn, #FBE9D1)" : "var(--surface-ink-tint)",
        color: isProd ? "var(--status-warn, #8B5A00)" : "var(--ink-secondary)",
      }}
    >
      {environment}
    </span>
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
