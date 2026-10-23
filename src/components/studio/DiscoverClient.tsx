"use client";

/**
 * Discover — the capability explorer, in Studio.
 *
 * The catalogue itself is REUSED wholesale (`SapCapabilityCatalogue`), which is
 * why honest status, the readiness scorecard, the content-type tiles, the lazy
 * per-row detail and the data-confirm badge all behave identically to the SAP
 * Operations surface. Forking it would mean forking honest-status, and two
 * implementations of "is this activated?" is exactly one too many.
 *
 * Studio adds two things on top: the business-domain lens, and the ability to
 * turn a discovered service into a governed Interface draft.
 *
 * "Add to interface" creates a DRAFT and nothing more. It grants no access.
 * A runtime call through the northbound API needs an ApiAccessGrant for that
 * interface, operation and environment, raised separately and decided by a
 * second person (src/lib/northbound/access.ts), and a write needs an ACTIVE
 * interface on top. The dialog says so, because a developer who believes this
 * button granted them production access is a developer about to be surprised.
 *
 * A service the catalogue does not list (a customer's own Z* or YY1_*) is not
 * added here: the page links to "Register your own API", which registers it by
 * its service path (P1.1). Since P1.2 Discover also lists what the tenant's own
 * Gateway catalogue reports ("On this tenant"), where a customer-built service
 * opens the same dialog pre-filled, and registers a service from its
 * description file ("From a file").
 */

import { useCallback, useId, useRef, useState } from "react";

import {
  SapCapabilityCatalogue,
  type CatalogueSelection,
} from "@/components/sap/SapCapabilityCatalogue";
import { RegisterOwnApiDialog, type RegisterProductOption } from "@/components/studio/RegisterOwnApiDialog";
import { TenantServicesPanel } from "@/components/studio/TenantServicesPanel";
import { UploadDescriptionDialog } from "@/components/studio/UploadDescriptionDialog";
import type { ListingEntry } from "@/lib/sap-public/tenant-discovery";

export interface DiscoverSolutionOption {
  id: string;
  name: string;
}

/**
 * THREE WAYS TO FIND A SERVICE (P1.2): SAP's published catalogue, the
 * services this tenant's own Gateway catalogue lists, and a description file
 * a builder holds. Tabs, not three pages: the dialog that turns any of them
 * into an interface is the same.
 */
const TABS = [
  { key: "catalogue", label: "SAP catalogue" },
  { key: "tenant", label: "On this tenant" },
  { key: "file", label: "From a file" },
] as const;
type DiscoverTab = (typeof TABS)[number]["key"];

type SubmitState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "done"; name: string };

export function DiscoverClient({
  solutions,
  canAuthor,
  tenant,
  product,
  products = [],
}: {
  solutions: readonly DiscoverSolutionOption[];
  canAuthor: boolean;
  /** The tenant the switcher selected. Null when none is configured anywhere. */
  tenant: string | null;
  /** That tenant's product. Was hardcoded to "s4hana" regardless of selection. */
  product: string;
  /** The OData products, for registering a listed service or a description file. */
  products?: readonly RegisterProductOption[];
}) {
  const ids = useId();
  const [tab, setTab] = useState<DiscoverTab>("catalogue");
  const tabRefs = useRef<Record<DiscoverTab, HTMLButtonElement | null>>({ catalogue: null, tenant: null, file: null });
  const [registerEntry, setRegisterEntry] = useState<ListingEntry | null>(null);
  const [registered, setRegistered] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selection, setSelection] = useState<CatalogueSelection | null>(null);
  const [solutionId, setSolutionId] = useState<string>(solutions[0]?.id ?? "");
  const [operation, setOperation] = useState<"READ" | "CREATE" | "UPDATE">("READ");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const close = useCallback(() => {
    setSelection(null);
    setState({ kind: "idle" });
  }, []);

  const submit = useCallback(async () => {
    if (!selection || !solutionId) return;
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/studio/interfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solutionId,
          externalId: selection.externalId,
          sapProduct: selection.product,
          name: selection.title,
          operation,
        }),
      });
      const json = (await res.json()) as { data?: { name: string }; error?: { message?: string } };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? "Could not create the interface draft.");
      }
      setState({ kind: "done", name: json.data.name });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }, [selection, solutionId, operation]);

  // Arrow keys move between the tabs, as the WAI-ARIA tabs pattern has it.
  const onTabKey = (e: React.KeyboardEvent, current: DiscoverTab) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === current);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!.key;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Where to find a service" style={tablist}>
        {TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            type="button"
            role="tab"
            id={`${ids}-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`${ids}-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onTabKey(e, t.key)}
            style={tab === t.key ? { ...tabButton, ...tabSelected } : tabButton}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${ids}-panel-catalogue`} aria-labelledby={`${ids}-tab-catalogue`} hidden={tab !== "catalogue"}>
        {tab === "catalogue" && (
          <SapCapabilityCatalogue
            product={product}
            domainLens
            {...(tenant ? { tenant } : {})}
            {...(canAuthor ? { onAddToInterface: (s: CatalogueSelection) => setSelection(s) } : {})}
          />
        )}
      </div>

      <div role="tabpanel" id={`${ids}-panel-tenant`} aria-labelledby={`${ids}-tab-tenant`} hidden={tab !== "tenant"}>
        {tab === "tenant" &&
          (tenant ? (
            <TenantServicesPanel
              tenant={tenant}
              product={product}
              canAuthor={canAuthor}
              {...(canAuthor ? { onAddToInterface: (s: CatalogueSelection) => setSelection(s), onRegister: setRegisterEntry } : {})}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-secondary)" }}>Choose a tenant to see the services it lists.</p>
          ))}
        {registered && (
          <p role="status" style={{ margin: "8px 0 0", fontSize: 13, color: "var(--status-signed-fg)" }}>
            Draft interface registered.{" "}
            <a href="/studio/interfaces" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
              Open Interfaces
            </a>{" "}
            to verify it.
          </p>
        )}
      </div>

      <div role="tabpanel" id={`${ids}-panel-file`} aria-labelledby={`${ids}-tab-file`} hidden={tab !== "file"}>
        {tab === "file" && (
          <section style={fileCard}>
            <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Register from a description file</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
              Have the service&apos;s $metadata, from ADT or /IWFND/MAINT_SERVICE? Upload it to create a draft interface with its
              contract straight away, without a communication arrangement and without contacting any SAP system. Verify it against
              a tenant before any write.
            </p>
            {canAuthor ? (
              <button type="button" style={{ ...btnPrimary, marginTop: 12 }} onClick={() => setUploading(true)}>
                Upload a description
              </button>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>Your role can view Studio but not author interfaces.</p>
            )}
          </section>
        )}
      </div>

      {registerEntry && (
        <RegisterOwnApiDialog
          solutions={solutions}
          products={products.filter((p) => p.key === product).length > 0 ? products.filter((p) => p.key === product) : products}
          initial={{
            servicePath: registerEntry.path ?? "",
            odataVersion: registerEntry.odataVersion,
            name: registerEntry.title ?? registerEntry.technicalName,
            product,
          }}
          onClose={() => setRegisterEntry(null)}
          onCreated={(id) => {
            setRegisterEntry(null);
            setRegistered(id);
          }}
        />
      )}
      {uploading && (
        <UploadDescriptionDialog solutions={solutions} products={products} defaultProduct={product} onClose={() => setUploading(false)} />
      )}

      {selection && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-to-interface-title"
          style={overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div style={dialog}>
            <h2 id="add-to-interface-title" style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
              Add to interface
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
              Creates a <strong>DRAFT</strong> interface for{" "}
              <code style={code}>{selection.externalId}</code>. This records intent only — it
              grants no access. Access is requested and decided separately.
            </p>

            {solutions.length === 0 ? (
              <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
                You have no solutions yet. An interface belongs to a solution, so register one
                first — a solution records what you are building and who owns it.{" "}
                {/* Naming the next step without offering it is how this dialog
                    became a dead end: it said "register one first" and there was
                    nowhere to do that. */}
                <a href="/studio/solutions" style={{ color: "var(--brand-navy)", fontWeight: 600 }}>
                  Register a solution
                </a>
                .
              </p>
            ) : state.kind === "done" ? (
              <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--status-signed-fg)" }}>
                Draft interface “{state.name}” created.
              </p>
            ) : (
              <>
                <label htmlFor="ati-solution" style={label}>
                  Solution
                </label>
                <select
                  id="ati-solution"
                  value={solutionId}
                  onChange={(e) => setSolutionId(e.target.value)}
                  style={field}
                >
                  {solutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <label htmlFor="ati-operation" style={{ ...label, marginTop: 12 }}>
                  Operation
                </label>
                <select
                  id="ati-operation"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as "READ" | "CREATE" | "UPDATE")}
                  style={field}
                >
                  <option value="READ">READ</option>
                  <option value="CREATE">CREATE — write, stronger review</option>
                  <option value="UPDATE">UPDATE — write, stronger review</option>
                </select>
              </>
            )}

            {state.kind === "error" && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--status-revoked-fg)" }}>
                {state.message}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={close} style={btnSecondary}>
                {state.kind === "done" ? "Close" : "Cancel"}
              </button>
              {solutions.length > 0 && state.kind !== "done" && (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={state.kind === "saving" || !solutionId}
                  style={{ ...btnPrimary, opacity: state.kind === "saving" ? 0.6 : 1 }}
                >
                  {state.kind === "saving" ? "Creating…" : "Create draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

const tablist: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  borderBottom: "1px solid var(--border-default)",
};

const tabButton: React.CSSProperties = {
  minHeight: 40,
  padding: "0 14px",
  border: "none",
  borderBottom: "2px solid transparent",
  background: "transparent",
  color: "var(--ink-secondary)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const tabSelected: React.CSSProperties = {
  color: "var(--ink-primary)",
  borderBottom: "2px solid var(--brand-navy)",
};

const fileCard: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card-warm, 12px)",
  padding: 20,
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const dialog: React.CSSProperties = {
  width: 520,
  maxWidth: "100%",
  background: "var(--surface-paper)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 16px 40px rgba(0,0,0,.12)",
  padding: 20,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-secondary)",
};

const field: React.CSSProperties = {
  width: "100%",
  height: 40,
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 14,
  padding: "0 8px",
};

const code: React.CSSProperties = {
  background: "var(--surface-ink-tint)",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: 12,
};

const btnBase: React.CSSProperties = {
  height: 40,
  padding: "0 16px",
  borderRadius: "var(--radius-input, 8px)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  border: "1px solid var(--border-strong)",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "var(--brand-navy)",
  color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)",
};
