"use client";

/**
 * Discover, "On this tenant" (roadmap P1.2): the services the tenant's own SAP
 * Gateway catalogue listed, grouped by what CoreEdge may do with them.
 *
 *   Customer-built          Z*, Y* and YY1_*: Register, pre-filled, where the
 *                           listing gave a path CoreEdge may store
 *   Published by SAP        Add to interface, and the communication scenario
 *                           that enables it (SAP's own table, S/4 Public)
 *   Other SAP services      collapsed, with SAP API Policy §1.2's sentence and
 *                           no action: they are not Published APIs
 *   Unknown namespace       no action: a partner's or the customer's
 *
 * It opens on the STORED listing (GET /api/studio/tenant-services): no SAP
 * call. "Read the service list" is the live listing (POST /api/sap/tdd/
 * tenant-services), a console read with its audit rows, at most once every
 * two minutes per tenant. A refusal is a result, with its correlation id, as
 * the console's other screens show one.
 *
 * Every title is rendered as text, and no listed address is ever a link.
 */

import { useCallback, useEffect, useState } from "react";

import type { CatalogueSelection } from "@/components/sap/SapCapabilityCatalogue";
import { NOT_PUBLISHED_SENTENCE, type ListingEntry, type ListingGroups } from "@/lib/sap-public/tenant-discovery";

type Scenarios = Record<string, { name: string | null; interfaceCount: number }>;

interface ListingView {
  listedAt: string;
  listedBy?: string | null;
  correlationId: string;
  catalogueStatus: string;
  v4Status: string | null;
  sentence: string;
  truncated: boolean;
  entryCount: number;
  connectionChanged?: boolean;
  groups: ListingGroups<ListingEntry>;
  scenarios: Scenarios;
  scenarioRelease: string | null;
}

interface StoredView {
  listable: boolean;
  v4Allowed: boolean;
  source: "connection" | "deployment";
  connection?: { label: string };
  mayList: boolean;
  note?: string;
  listing: ListingView | null;
}

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; view: StoredView };
type Refusal = { code: string; message: string; correlationId?: string };

export function TenantServicesPanel({
  tenant,
  product,
  canAuthor,
  onAddToInterface,
  onRegister,
}: {
  tenant: string;
  product: string;
  canAuthor: boolean;
  onAddToInterface?: (s: CatalogueSelection) => void;
  onRegister?: (entry: ListingEntry) => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [listing, setListing] = useState<ListingView | null>(null);
  const [reading, setReading] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [v4, setV4] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/studio/tenant-services?product=${encodeURIComponent(product)}&tenant=${encodeURIComponent(tenant)}`);
      const json = (await res.json()) as { data?: StoredView; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "The stored service list could not be read.");
      setLoad({ kind: "ready", view: json.data });
      setListing(json.data.listing);
    } catch (err) {
      setLoad({ kind: "error", message: err instanceof Error ? err.message : "The stored service list could not be read." });
    }
  }, [product, tenant]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readLive = async () => {
    setReading(true);
    setRefusal(null);
    try {
      const res = await fetch("/api/sap/tdd/tenant-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, tenant, v4 }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: ListingView & { stored: boolean }; error?: Refusal };
      if (!res.ok || !json.data) {
        setRefusal(json.error ?? { code: String(res.status), message: "The service list could not be read." });
        return;
      }
      if (json.data.stored) await refresh();
      else setListing({ ...json.data, listedBy: null });
    } finally {
      setReading(false);
    }
  };

  if (load.kind === "loading") return <p style={muted}>Reading the stored service list…</p>;
  if (load.kind === "error") return <p role="alert" style={{ ...muted, color: "var(--status-revoked-fg)" }}>{load.message}</p>;
  const view = load.view;
  const label = view.connection?.label ?? tenant;

  if (!view.listable) {
    return (
      <section style={card}>
        <h2 style={h2}>No service catalogue to read</h2>
        <p style={body}>
          This product serves no SAP Gateway service catalogue. Register a service by its path, or from its description under
          From a file.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section style={card} aria-label="The tenant's service list">
        <h2 style={h2}>Services {label} lists</h2>
        <p style={body}>
          {listing
            ? `Last read ${new Date(listing.listedAt).toLocaleString()}${listing.listedBy ? ` by ${listing.listedBy}` : ""}.`
            : view.note ?? "Not read yet."}{" "}
          Reading it sends one catalogue request (a few pages at most) to the system, reads no business data, is recorded in the
          audit trail, and can run once every two minutes.
        </p>
        {listing?.connectionChanged && (
          <p style={{ ...body, color: "var(--status-awaiting-fg)" }}>
            The connection was changed after this list was read, so it may describe another system. Read it again.
          </p>
        )}
        {view.mayList && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 8 }}>
            <button type="button" style={btnPrimary} onClick={() => void readLive()} disabled={reading}>
              {reading ? "Reading…" : `Read the service list from ${label}`}
            </button>
            {view.v4Allowed && (
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={v4} onChange={(e) => setV4(e.target.checked)} />
                Also read the OData V4 service groups (the user needs Gateway catalogue authorisations)
              </label>
            )}
          </div>
        )}
        {refusal && (
          <p role="alert" style={{ ...body, color: "var(--status-revoked-fg)", marginTop: 8 }}>
            {refusal.message} <span style={muted}>({refusal.code}{refusal.correlationId ? ` · ${refusal.correlationId}` : ""})</span>
          </p>
        )}
      </section>

      {listing && (
        <>
          {listing.catalogueStatus !== "OK" && (
            <p style={{ ...body, color: listing.catalogueStatus === "TRUNCATED" ? "var(--ink-secondary)" : "var(--status-awaiting-fg)" }}>
              {listing.sentence}
            </p>
          )}
          <Group
            title="Customer-built"
            note="Services your team built: Z* and Y* (developer extensibility) and YY1_* (key user). Register one by the path the system gave; verify it before any write."
            entries={listing.groups.customerBuilt}
            render={(e) => (
              <>
                <Badge text={e.class === "CUSTOMER_KEY_USER" ? "Key user (YY1_)" : "Developer (Z*, Y*)"} />
                {canAuthor && onRegister && e.path ? (
                  <button type="button" style={btnSmall} onClick={() => onRegister(e)} aria-label={`Register ${e.technicalName}`}>
                    Register
                  </button>
                ) : (
                  <span style={muted}>{e.path ? "" : "no path CoreEdge may store"}</span>
                )}
              </>
            )}
          />
          <Group
            title="Published by SAP"
            note="On the Business Accelerator Hub, curated in CoreEdge, or in SAP's communication scenario documentation."
            entries={listing.groups.published}
            render={(e) => (
              <>
                {e.scenarioIds[0] ? (
                  <code style={chip} title={e.scenarioIds.map((id) => listing.scenarios[id]?.name ?? id).join(", ")}>
                    {e.scenarioIds[0]}
                    {e.scenarioIds.length > 1 ? ` +${e.scenarioIds.length - 1}` : ""}
                  </code>
                ) : null}
                {canAuthor && onAddToInterface && e.catalogueExternalId ? (
                  <button
                    type="button"
                    style={btnSmall}
                    onClick={() =>
                      onAddToInterface({
                        id: e.catalogueExternalId!,
                        externalId: e.catalogueExternalId!,
                        title: e.title ?? e.technicalName,
                        contentType: "API",
                        apiType: e.odataVersion === "V4" ? "ODATAV4" : "ODATAV2",
                        product,
                      })
                    }
                  >
                    Add to interface
                  </button>
                ) : null}
              </>
            )}
          />
          <details style={card}>
            <summary style={{ ...h3, cursor: "pointer" }}>Other SAP services, not Published APIs ({listing.groups.sapUnpublished.length})</summary>
            <p style={body}>{NOT_PUBLISHED_SENTENCE}</p>
            <EntryList entries={listing.groups.sapUnpublished} render={() => null} />
          </details>
          <Group
            title="Unknown namespace"
            note="A namespace SAP's sources do not use. Check with your Basis team whether it is a partner's or your own."
            entries={listing.groups.unknown}
            render={() => null}
          />
          {listing.truncated && <p style={muted}>The list is incomplete: CoreEdge reads at most 5,000 services in one listing.</p>}
          {listing.scenarioRelease && (
            <p style={muted}>Communication scenarios: help.sap.com, Available Interfaces for Your Selected Scope, release {listing.scenarioRelease}.</p>
          )}
        </>
      )}
    </div>
  );
}

function Group({
  title,
  note,
  entries,
  render,
}: {
  title: string;
  note: string;
  entries: readonly ListingEntry[];
  render: (e: ListingEntry) => React.ReactNode;
}) {
  return (
    <section style={card} aria-label={title}>
      <h3 style={h3}>
        {title} <span style={muted}>({entries.length})</span>
      </h3>
      <p style={{ ...body, marginBottom: 8 }}>{note}</p>
      <EntryList entries={entries} render={render} />
    </section>
  );
}

function EntryList({ entries, render }: { entries: readonly ListingEntry[]; render: (e: ListingEntry) => React.ReactNode }) {
  if (entries.length === 0) return <p style={muted}>None listed.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {entries.map((e) => (
        <li key={e.id} style={row}>
          <span style={{ minWidth: 0, flex: "1 1 260px" }}>
            <code style={mono}>{e.technicalName}</code> <span style={muted}>v{e.version} · OData {e.odataVersion}</span>
            {e.title ? <span style={{ display: "block", ...muted }}>{e.title}</span> : null}
          </span>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{render(e)}</span>
        </li>
      ))}
    </ul>
  );
}

function Badge({ text }: { text: string }) {
  return <span style={badge}>{text}</span>;
}

/* ── presentation ─────────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card-warm, 12px)",
  padding: 16,
};
const h2: React.CSSProperties = { margin: "0 0 6px", fontSize: 16, fontWeight: 600 };
const h3: React.CSSProperties = { margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "var(--ink-primary)" };
const body: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" };
const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };
const mono: React.CSSProperties = { fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13, color: "var(--ink-primary)" };
const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 0",
  borderTop: "1px solid var(--border-default)",
};
const chip: React.CSSProperties = {
  background: "var(--surface-ink-tint)",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: 12,
  color: "var(--ink-primary)",
};
const badge: React.CSSProperties = {
  borderRadius: "var(--radius-pill, 999px)",
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 600,
  border: "1px solid var(--brand-navy)",
  color: "var(--brand-navy)",
};
const btnBase: React.CSSProperties = {
  borderRadius: "var(--radius-input, 8px)",
  fontWeight: 600,
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  height: 40,
  padding: "0 16px",
  fontSize: 14,
  background: "var(--brand-navy)",
  color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)",
};
const btnSmall: React.CSSProperties = {
  ...btnBase,
  height: 32,
  padding: "0 10px",
  fontSize: 12,
  background: "var(--surface-paper)",
  color: "var(--brand-navy)",
  border: "1px solid var(--brand-navy)",
};
