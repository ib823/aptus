"use client";

/**
 * Interfaces — the governed config for what a solution consumes.
 *
 * The detail is four cards: Source (which SAP service: catalogue or your own),
 * Runtime (how it behaves), Contract (what goes in and comes back), Governance
 * (who can see it and how it is recorded) — plus a fifth, Mapping, which is
 * DISABLED. A read interface has one more, Query policy (P1.4,
 * QueryPolicyCard.tsx): what its callers may select, filter, sort, look up by
 * key and page through.
 *
 * YOUR OWN API. "Register your own API" creates an interface for a service the
 * customer built (Z*, YY1_*, an ECC Gateway service), named by its service
 * path. Its Source card shows the path and version, edits both in place, and
 * — for every OData interface — offers Verify, which asks the SAP system for
 * the service's description and lists its datasets.
 *
 * On the disabled mapping card: it is shown rather than hidden because the shape
 * of the eventual feature is part of the design, and hiding it would invite
 * someone to build a private version. It is inert in three independent ways —
 * drawn as a placeholder, `pointer-events: none`, and (the one that actually
 * matters) the API refuses to accept `mappingVersion` at all. A placeholder is
 * a hint; an unaccepted field is a guarantee.
 *
 * "Placeholder" means a quiet SURFACE and the COPY, never opacity. The card
 * used to be drawn at opacity 0.55, which fades every ink into the page: its
 * heading read at 3.71:1 and its text at 2.11:1 in light, 2.51:1 in dark. Its
 * text is the explanation of why it is inert, so it is read, and it keeps full
 * ink on --surface-ink-tint inside a dashed edge.
 *
 * Runtime values are shown as PLATFORM DEFAULTS, read-only. There are no columns
 * behind them, and rendering an editable box over a value nothing reads would
 * imply a control that does not exist.
 */

import { useRouter } from "next/navigation";

import { useCallback, useState } from "react";

import { ProductLabel } from "@/components/sap/ProductLabel";
import {
  RegisterOwnApiDialog,
  type RegisterProductOption,
  type RegisterSolutionOption,
} from "@/components/studio/RegisterOwnApiDialog";
import {
  ServiceVerifyPanel,
  type VerifiedEnvironment,
  type VerifyTarget,
} from "@/components/studio/ServiceVerifyPanel";
import { QueryPolicyCard } from "@/components/studio/QueryPolicyCard";
import { StudioStatusChip, type HonestStatus } from "@/components/studio/StudioStatusChip";
import {
  inferODataVersion,
  isODataVersion,
  ODATA_VERSIONS,
  validateServicePath,
  type ODataVersion,
} from "@/lib/sap-public/service-path";
import type { SchemaState } from "@/lib/studio/contract-provenance";
import { SIGN_OFF_BASIS_LABELS, type SignOffBasis } from "@/lib/studio/api-policy";
import { PolicySignOffDialog } from "@/components/studio/PolicySignOffDialog";
import {
  describeWriteReadiness,
  readyEnvironments,
  UPDATE_NOT_EXECUTABLE,
  type WriteReadinessRow,
} from "@/lib/studio/write-readiness";

export interface StudioInterface {
  id: string;
  name: string;
  version: number;
  sapProduct: string;
  externalId: string;
  operation: "READ" | "CREATE" | "UPDATE";
  entitySet: string | null;
  /**
   * The entity set the curated registry knows for this service, when it knows
   * one — the value the editor offers as its placeholder. Null for a catalogue
   * service the registry has no record of. The field is free text either way:
   * the runtime validates against the tenant, not against this hint.
   */
  suggestedEntitySet?: string | null;
  /**
   * The write chain per environment — live credential with a write key, and a
   * live approved write grant for this capability. Only a WRITE interface
   * carries it: the route refuses to activate one unless some environment is
   * complete, and the card shows the table first. Absent means unknown →
   * treated as not ready.
   */
  writeReadiness?: readonly WriteReadinessRow[];
  mode: string;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  mappingVersion: number | null;
  hasRequestSchema: boolean;
  /** Where the stored response schema stands against this contract (contract-provenance.ts). */
  responseSchemaState: SchemaState;
  solutionId: string;
  solutionName: string;
  /**
   * The interface's OWN service root (your own API), or null/absent for a
   * catalogue service. Optional so callers that predate it read as catalogue.
   */
  servicePath?: string | null;
  odataVersion?: string | null;
  /** ISO timestamp of the last successful Verify of the current contract. */
  serviceVerifiedAt?: string | null;
  serviceVerifiedEnvironment?: string | null;
  serviceVerifiedEntitySets?: readonly string[] | null;
  /** Your own API: each environment with a current successful verify (the write gate is per environment). */
  serviceVerifiedEnvironments?: readonly VerifiedEnvironment[];
  /** The recorded contract and who described it (P1.2): a tenant's verify, an uploaded file, sampled rows. */
  contract?: { semver: string; describedBy: "tenant" | "upload" | "sample" } | null;
  /** The SAP API Policy §1.2 sign-off (P1.2), present only where one is needed. */
  policySignOff?: { signed: { by: string | null; at: string; basis: SignOffBasis; reference: string } | null };
}

export type { VerifyTarget, RegisterProductOption, RegisterSolutionOption };

const STATUS_CHIP: Record<StudioInterface["status"], HonestStatus> = {
  ACTIVE: "ACTIVATED",
  DRAFT: "NOT_CHECKED",
  DEPRECATED: "NOT_PROBEABLE",
};

/** Lifecycle meanings for assistive tech — see SolutionsClient.STATUS_MEANING. */
const STATUS_MEANING: Record<StudioInterface["status"], string> = {
  ACTIVE: "serving runtime calls",
  DRAFT: "defined, not yet activated",
  DEPRECATED: "kept for the record, not for new use",
};

/**
 * Platform defaults — described, not configured. See the file header. Each
 * line is what the runtime does (P1.4 corrected two): the read's timeout
 * (northbound/read.ts), the credential's own bucket (rate-limit.ts
 * RATE_LIMITS.northbound), and the response limit of each kind of read.
 */
const RUNTIME_DEFAULTS = [
  ["Timeout", "15 s, or the connection's override (at most 30 s)"],
  ["Retry", "none — a failed read is reported, not retried behind your back"],
  ["Cache", "30s on live catalogue reads"],
  ["Quota", "60 calls a minute per credential, shared by data reads, /schema and Test Console runs"],
  ["Response limit", "4.5 MB on ?limit reads; the query policy's page limit on queries"],
] as const;

export function InterfacesClient({
  interfaces,
  canAuthor,
  solutions = [],
  products = [],
  verifyTargets = [],
  openRegister = false,
}: {
  interfaces: readonly StudioInterface[];
  canAuthor: boolean;
  /** For "Register your own API": the organization's solutions. */
  solutions?: readonly RegisterSolutionOption[];
  /** OData products only — Ariba has no service path. */
  products?: readonly RegisterProductOption[];
  /** Declared connections, per product, that Verify may ask. Never a secret. */
  verifyTargets?: readonly VerifyTarget[];
  /** Open the register dialog on arrival (/studio/interfaces?register=1). */
  openRegister?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(interfaces[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(openRegister && canAuthor);
  const [signingOff, setSigningOff] = useState(false);
  /** Verifies answered on this screen: the Query policy card reads itself again on each. */
  const [verifies, setVerifies] = useState(0);

  const selected = interfaces.find((i) => i.id === selectedId) ?? null;
  const selectedIsCustom = selected?.servicePath != null && selected.servicePath !== "";
  const selectedIsOData = selected !== null && products.some((p) => p.key === selected.sapProduct);
  // A live write through your own API: any dataset, path or version change
  // clears verification and returns it to draft. Every editor says so first.
  const selectedLiveWrite = selectedIsCustom && selected?.mode === "WRITE" && selected.status === "ACTIVE";

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/interfaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "The change could not be saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const registerBar = canAuthor ? (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button type="button" style={btnSmall} onClick={() => setRegistering(true)}>
        Register your own API
      </button>
    </div>
  ) : null;

  const registerDialog = registering ? (
    <RegisterOwnApiDialog
      solutions={solutions}
      products={products}
      onClose={() => setRegistering(false)}
      onCreated={(id) => {
        setSelectedId(id);
        setRegistering(false);
        router.refresh();
      }}
    />
  ) : null;

  if (interfaces.length === 0) {
    return (
      <>
        {registerBar}
        <section style={card}>
          <h2 style={h2}>No interfaces yet</h2>
          <p style={body}>
            An interface records that a solution consumes one SAP service, at one
            operation. Add one from Discover — open a capability and choose “Add to interface” —
            or register your own API (a Z* RAP service, a YY1_* custom CDS view, an ECC Gateway
            service) with its service path.
          </p>
        </section>
        {registerDialog}
      </>
    );
  }

  return (
    <>
    {registerBar}
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(280px, 360px) 1fr", alignItems: "start" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
              <Th>Interface</Th>
              <Th>Op</Th>
              <Th>Ver</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((i) => {
              const isSelected = i.id === selectedId;
              return (
                <tr
                  key={i.id}
                  onClick={() => setSelectedId(i.id)}
                  style={{
                    borderTop: "1px solid var(--border-default)",
                    cursor: "pointer",
                    background: isSelected ? "var(--brand-navy-soft)" : "transparent",
                  }}
                >
                  {/* Selection is not carried by the fill alone (1.37:1 from the
                      page in dark): the selected cell has a --brand-navy bar, and
                      the name is a button marked aria-current — which a plain
                      <tr> cannot honestly carry without a grid role — so the row
                      is also reachable and selectable from the keyboard. */}
                  <Td style={isSelected ? { boxShadow: "inset 3px 0 0 var(--brand-navy)" } : undefined}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(i.id);
                      }}
                      style={rowSelectBtn}
                    >
                      {i.name}
                    </button>
                    {/* --ink-muted is 4.45:1 on --brand-navy-soft in light; the
                        selected row reads its secondary line in --ink-secondary. */}
                    <span style={{ display: "block", ...muted, color: isSelected ? "var(--ink-secondary)" : "var(--ink-muted)" }}>
                      {i.solutionName}
                      {i.servicePath ? " · own API" : ""}
                      {i.policySignOff && !i.policySignOff.signed ? " · §1.2 sign-off needed" : ""}
                    </span>
                  </Td>
                  <Td>{i.operation}</Td>
                  <Td>v{i.version}</Td>
                  <Td>
                    <StudioStatusChip status={STATUS_CHIP[i.status]} label={i.status.toLowerCase()} meaning={STATUS_MEANING[i.status]} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <DetailCard title="Source">
            {selectedIsCustom ? (
              <>
                <Row label="Your own service" mono>
                  {canAuthor ? (
                    <ServicePathEditor
                      key={`${selected.id}:${selected.servicePath}:${selected.odataVersion}`}
                      value={selected.servicePath ?? ""}
                      version={isODataVersion(selected.odataVersion) ? selected.odataVersion : null}
                      busy={busy}
                      onSave={(change) => patch({ id: selected.id, ...change })}
                    />
                  ) : (
                    selected.servicePath
                  )}
                </Row>
                <Row label="OData version">{selected.odataVersion ?? "not set"}</Row>
                <Row label="Grant id" mono>{selected.externalId}</Row>
              </>
            ) : (
              <Row label="Catalogue service" mono>{selected.externalId}</Row>
            )}
            <Row label="Product">
              {/* The NAME via the one component, never the raw key — the sweep
                  that guards this matched `product` and not `sapProduct`. */}
              <ProductLabel product={selected.sapProduct} />
            </Row>
            <Row label="Entity set" mono>
              {canAuthor ? (
                <EntitySetEditor
                  key={selected.id}
                  value={selected.entitySet}
                  suggestion={selected.suggestedEntitySet ?? null}
                  liveWrite={selectedLiveWrite}
                  busy={busy}
                  onSave={(next) => patch({ id: selected.id, entitySet: next })}
                />
              ) : (
                (selected.entitySet ?? "not set")
              )}
            </Row>
            <Row label="Solution">{selected.solutionName}</Row>
            {selectedIsOData && (
              <Row label="Verified">
                {/* The Query policy card's "Go to Verify" lands here. */}
                <span id="service-verify" tabIndex={-1} style={{ display: "block" }}>
                <ServiceVerifyPanel
                  key={selected.id}
                  interfaceId={selected.id}
                  interfaceVersion={selected.version}
                  isCustom={selectedIsCustom}
                  entitySet={selected.entitySet}
                  verifiedAt={selected.serviceVerifiedAt ?? null}
                  verifiedEnvironment={selected.serviceVerifiedEnvironment ?? null}
                  verifiedEntitySets={selected.serviceVerifiedEntitySets ?? null}
                  verifiedEnvironments={selected.serviceVerifiedEnvironments ?? []}
                  odataVersion={selected.odataVersion ?? null}
                  liveWrite={selectedLiveWrite}
                  targets={verifyTargets.filter((t) => t.product === selected.sapProduct)}
                  canAuthor={canAuthor}
                  productLabel={products.find((p) => p.key === selected.sapProduct)?.label}
                  onVerified={() => setVerifies((n) => n + 1)}
                />
                </span>
              </Row>
            )}
          </DetailCard>

          <DetailCard title="Runtime">
            {RUNTIME_DEFAULTS.map(([k, v]) => (
              <Row key={k} label={k}>{v}</Row>
            ))}
            <p style={{ ...muted, marginTop: 8 }}>
              Platform defaults. These describe how the platform behaves; they are not
              per-interface settings in this version.
            </p>
          </DetailCard>

          <DetailCard title="Contract">
            <Row label="Operation">
              {selected.operation}
              {selected.mode === "WRITE" && (
                <span style={{ marginLeft: 8, color: "var(--status-awaiting-fg)", fontWeight: 600 }}>
                  ⚠ write — stronger review
                </span>
              )}
              {selected.operation === "UPDATE" && (
                <span style={{ ...muted, display: "block", marginTop: 4 }}>{UPDATE_NOT_EXECUTABLE}</span>
              )}
            </Row>
            {selected.mode === "WRITE" && (
              <Row label="Write chain">
                {/* Per environment, both halves the broker checks at call time.
                    "Ready" means a write in that environment would pass the
                    gates; nothing ready means Mark ACTIVE is refused. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {(selected.writeReadiness ?? []).map((row) => (
                    <span key={row.environment} style={{ color: row.ready ? "var(--status-signed-fg)" : "var(--ink-secondary)" }}>
                      {describeWriteReadiness(row)}
                    </span>
                  ))}
                  <span style={{ ...muted, marginTop: 4 }}>
                    {readyEnvironments(selected.writeReadiness ?? []).length > 0
                      ? `Ready in ${readyEnvironments(selected.writeReadiness ?? []).join(", ")} — the solution can write there once this interface is ACTIVE.`
                      : selectedIsCustom
                        ? "No environment is ready — the broker refuses every write that lacks a write key, an approved write grant, or a verification of this service in that environment, so this interface cannot be activated yet. Get the write grant approved for an environment, issue that environment's write key under API Access (Runtime credentials, Issue write key), allow writes on its connection under Connections, and verify the service there."
                        : "No environment is ready — the broker refuses every write that lacks a write key or an approved write grant, so this interface cannot be activated yet. Get the write grant approved for an environment, issue that environment's write key under API Access (Runtime credentials, Issue write key), and allow writes on its connection under Connections."}
                  </span>
                </div>
              </Row>
            )}
            <Row label="Version">v{selected.version}</Row>
            <Row label="Recorded contract">
              {selected.contract
                ? `${selected.contract.semver} (${
                    selected.contract.describedBy === "upload"
                      ? "from file, not verified"
                      : selected.contract.describedBy === "sample"
                        ? "from sampled rows"
                        : "from the tenant"
                  })`
                : "none yet: verify the service, or register it from its description file"}
            </Row>
            <Row label="Request schema">
              {selected.hasRequestSchema ? "captured" : "not captured yet"}
            </Row>
            <Row label="Response schema">
              {/* Of THIS contract (P0.4, A38): a schema of an earlier version, or
                  of one that cannot be established, is not served, and says so. */}
              {selected.responseSchemaState === "current"
                ? "captured"
                : selected.responseSchemaState === "stale"
                  ? "captured under an earlier version — not served; capture it again in the Test Console"
                  : selected.responseSchemaState === "unverified"
                    ? "captured before versions were recorded — not served; capture it again in the Test Console"
                    : "not captured yet — run it in the Test Console"}
            </Row>
            <Row label="Errors">
              <code style={code}>{"{ code, message, correlationId }"}</code>
            </Row>
          </DetailCard>

          {/* What callers may ask of a read (P1.4). Keyed by the version too:
              a contract change clears the basis, and the card reloads; and by
              the verifies on this screen, which write the basis and recompile
              the policy without bumping the version. */}
          {selected.operation === "READ" && (
            <QueryPolicyCard key={`${selected.id}:${selected.version}:${verifies}`} interfaceId={selected.id} canAuthor={canAuthor} />
          )}

          <DetailCard title="Governance">
            <Row label="Access">
              Decided separately in the API Access ledger. Defining an interface grants nothing.
            </Row>
            <Row label="Audit">
              Config changes are recorded, and every runtime call this interface serves is
              audited per call — solution, operation, status and which connection answered.
            </Row>
            <Row label="Status">{selected.status}</Row>
            {selected.policySignOff && (
              <Row label="SAP API Policy §1.2">
                {selected.policySignOff.signed ? (
                  <span>
                    Signed off by {selected.policySignOff.signed.by ?? "a member of your organization"} on{" "}
                    {selected.policySignOff.signed.at.slice(0, 10)}: {SIGN_OFF_BASIS_LABELS[selected.policySignOff.signed.basis]}
                    {selected.policySignOff.signed.reference ? ` (${selected.policySignOff.signed.reference})` : ""}.
                  </span>
                ) : (
                  <span style={{ color: "var(--status-awaiting-fg)" }}>
                    Sign-off needed before approval: this interface calls a service your team built on SAP S/4HANA Cloud Public Edition.
                  </span>
                )}
                {canAuthor && !selected.policySignOff.signed && (
                  <button type="button" style={{ ...btnSmall, marginLeft: 8 }} onClick={() => setSigningOff(true)}>
                    Record the sign-off
                  </button>
                )}
              </Row>
            )}
          </DetailCard>
          {signingOff && (
            <PolicySignOffDialog
              interfaceId={selected.id}
              serviceIdentity={selected.externalId}
              onClose={() => setSigningOff(false)}
              onSigned={() => {
                setSigningOff(false);
                router.refresh();
              }}
            />
          )}

          {/* Disabled by design — see the file header. No aria-disabled: nothing
              here is interactive, so the state is carried by the copy ("not in
              this version") rather than by an ARIA attribute that a region does
              not support and screen readers would ignore anyway. Visually it is
              a placeholder — a quiet surface with a dashed edge — and not a
              faded card: every line on it is read, at full ink. */}
          <section
            style={{
              ...card,
              pointerEvents: "none",
              background: "var(--surface-ink-tint)",
              border: "1px dashed var(--border-strong)",
              boxShadow: "none",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "var(--ink-primary)" }}>
              Mapping <span style={{ ...muted, fontWeight: 500 }}>· not in this version</span>
            </h3>
            <p style={{ ...body, fontSize: 13 }}>
              Field-level mapping and transformation are a later phase. This interface passes
              the service&apos;s own shape through unchanged, and{" "}
              <code style={code}>mappingVersion</code> stays{" "}
              <strong>{selected.mappingVersion === null ? "null" : String(selected.mappingVersion)}</strong>.
            </p>
          </section>

          {canAuthor && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {selected.status !== "ACTIVE" && (
                /* The route refuses ACTIVE without an entity set (an ACTIVE
                   interface that 400s every read is a contract with a hole in
                   it). Saying so on the button beats a refusal after the click. */
                <button
                  type="button"
                  disabled={
                    busy ||
                    selected.entitySet === null ||
                    selected.operation === "UPDATE" ||
                    (selected.mode === "WRITE" && selectedIsCustom && !selected.serviceVerifiedAt) ||
                    (selected.mode === "WRITE" && readyEnvironments(selected.writeReadiness ?? []).length === 0)
                  }
                  title={
                    selected.entitySet === null
                      ? "Set the entity set first — an ACTIVE interface with none would refuse every read."
                      : selected.operation === "UPDATE"
                        ? UPDATE_NOT_EXECUTABLE
                        : selected.mode === "WRITE" && selectedIsCustom && !selected.serviceVerifiedAt
                        ? "Verify this interface's own SAP service first — the broker refuses writes to an unverified service."
                        : selected.mode === "WRITE" && readyEnvironments(selected.writeReadiness ?? []).length === 0
                        ? selectedIsCustom
                          ? "No environment holds the full write chain (credential with write key + approved write grant + this service verified there) — a WRITE interface activated now builds toward a call the broker refuses."
                          : "No environment holds the full write chain (credential with write key + approved write grant) — a WRITE interface activated now builds toward a call the broker refuses."
                        : undefined
                  }
                  onClick={() => patch({ id: selected.id, status: "ACTIVE" })}
                  style={btnPrimary}
                >
                  Mark ACTIVE
                </button>
              )}
              {selected.status !== "DEPRECATED" && (
                <button type="button" disabled={busy} onClick={() => patch({ id: selected.id, status: "DEPRECATED" })} style={btnSmall}>
                  Deprecate
                </button>
              )}
              {error && <span style={{ fontSize: 12, color: "var(--status-revoked-fg)" }}>{error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
    {registerDialog}
    </>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "4px 0", fontSize: 13, alignItems: "baseline" }}>
      <span style={{ width: 150, flexShrink: 0, color: "var(--ink-muted)" }}>{label}</span>
      <span style={{ color: "var(--ink-primary)", ...(mono ? { fontFamily: "var(--font-mono, monospace)", fontSize: 12 } : {}) }}>
        {children}
      </span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties | undefined }) {
  return <td style={{ padding: "9px 12px", verticalAlign: "top", color: "var(--ink-primary)", ...style }}>{children}</td>;
}

/** The row's name as a control: reads as the bold name it replaced, focuses with the Studio ring. */
const rowSelectBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  fontWeight: 600,
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

/**
 * The entity set, editable in place.
 *
 * WHY THIS EXISTS. `Interface.entitySet` was accepted by the PATCH route from the
 * day it was added, and no UI ever sent it. Discover creates every interface
 * without one, so every interface read "not set" — and the broker refuses a read
 * with 400 "This interface has no entity set configured. Set one in Studio",
 * advice that could not be followed anywhere in the product.
 *
 * CLEARING IS SUPPORTED, deliberately. The schema accepts null, and an entity set
 * entered wrongly has to be removable rather than only overwritable — otherwise
 * the fix for a typo is worse than the typo.
 *
 * EXPECT THE VERSION TO INCREMENT. Changing this changes the contract, so the
 * route bumps `version`. A DRAFT created without one therefore reaches v2 the
 * moment it is set. That is correct — an interface that 400s and one that returns
 * rows are not the same contract — and it is not a bug to be tidied away.
 *
 * AND EXPECT THE CAPTURES TO GO (P0.4, A38). The response schema and the mock
 * fixtures were recorded from the old dataset; the route clears them with the
 * bump, so the contract and the mock stop describing rows the new one never
 * returns. Said before the save.
 */
function EntitySetEditor({
  value,
  suggestion,
  liveWrite = false,
  busy,
  onSave,
}: {
  value: string | null;
  /**
   * What the curated registry knows this service's entity set to be, or null.
   * The placeholder used to be `A_BusinessPartner` on EVERY interface — the
   * entity set of a different service — so it was a hint that could only
   * mislead. Now it is the real name when one is known, and an honest
   * description of what to type when one is not.
   */
  suggestion: string | null;
  /**
   * Your own API, a WRITE interface that is ACTIVE: a new dataset clears
   * verification and returns it to draft — writes stop until it is verified
   * and activated again. Said before the save, as the path editor does.
   */
  liveWrite?: boolean;
  busy: boolean;
  onSave: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span>{value ?? "not set"}</span>
        <button type="button" style={linkBtn} onClick={() => setEditing(true)}>
          {value ? "Change" : "Set"}
        </button>
      </span>
    );
  }

  const trimmed = draft.trim();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={suggestion ?? "Entity set name from this service's $metadata"}
        aria-label="Entity set"
        style={{
          height: 28,
          padding: "0 8px",
          borderRadius: "var(--radius-input, 8px)",
          border: "1px solid var(--border-strong)",
          background: "var(--surface-paper)",
          color: "var(--ink-primary)",
          fontSize: 12.5,
          fontFamily: "var(--font-mono, ui-monospace), monospace",
          minWidth: 200,
        }}
      />
      <button
        type="button"
        style={linkBtn}
        disabled={busy || trimmed === (value ?? "")}
        onClick={() => onSave(trimmed.length > 0 ? trimmed : null)}
      >
        Save
      </button>
      <button type="button" style={linkBtn} disabled={busy} onClick={() => { setDraft(value ?? ""); setEditing(false); }}>
        Cancel
      </button>
      {trimmed.length === 0 && value !== null && (
        <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Saving empty clears it.</span>
      )}
      {value !== null && (
        <span style={{ flexBasis: "100%", fontSize: 11, lineHeight: "16px", color: "var(--ink-muted)", maxWidth: 420 }}>
          A new dataset is a new contract version: the captured response schema and recorded fixtures are cleared, so
          capture them again from a Test Console run.
        </span>
      )}
      {liveWrite && (
        <span
          style={{ flexBasis: "100%", fontSize: 11, lineHeight: "16px", color: "var(--status-awaiting-fg)", fontFamily: "inherit", maxWidth: 420 }}
        >
          This write interface is live. Saving a new dataset clears verification and returns it to draft, so writes
          stop until it is verified and activated again.
        </span>
      )}
    </span>
  );
}

/**
 * Your own API's service path AND OData version, editable in place — the
 * EntitySetEditor pattern.
 *
 * The version is edited here because Verify's VERSION_MISMATCH tells the
 * developer to change it, and a read-only version left that advice with no
 * control to follow it. Typing a new path re-infers the version from it (the
 * register dialog's rule) until the developer picks one by hand.
 *
 * A new path is a new service: the route bumps the version, clears
 * verification, derives a new grant id (so existing grants, which name the old
 * path, no longer apply) and returns an active WRITE interface to DRAFT. A new
 * OData version alone bumps the version, clears verification and returns an
 * active WRITE interface to draft too, but keeps the grant id — grants stay
 * attached. The warning says which, before the save, because each of those is
 * a consequence somebody else will notice.
 */
function ServicePathEditor({
  value,
  version,
  busy,
  onSave,
}: {
  value: string;
  version: ODataVersion | null;
  busy: boolean;
  onSave: (change: { servicePath?: string; odataVersion?: ODataVersion }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [draftVersion, setDraftVersion] = useState<ODataVersion>(version ?? inferODataVersion(value));
  const [versionTouched, setVersionTouched] = useState(false);

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{value}</span>
        <button type="button" style={linkBtn} onClick={() => setEditing(true)}>
          Change path or version
        </button>
      </span>
    );
  }

  const trimmed = draft.trim();
  const check = validateServicePath(trimmed);
  const normalized = check.ok ? check.path : null;
  const pathChanged = normalized !== null && normalized !== value;
  const versionChanged = draftVersion !== version;
  const change: { servicePath?: string; odataVersion?: ODataVersion } = {
    ...(pathChanged ? { servicePath: normalized } : {}),
    ...(versionChanged ? { odataVersion: draftVersion } : {}),
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            // The register dialog's rule: the path suggests the version until
            // the developer chooses one.
            if (!versionTouched) {
              const next = validateServicePath(e.target.value.trim());
              if (next.ok) setDraftVersion(inferODataVersion(next.path));
            }
          }}
          aria-label="Service path"
          spellCheck={false}
          style={{
            height: 28,
            padding: "0 8px",
            borderRadius: "var(--radius-input, 8px)",
            border: "1px solid var(--border-strong)",
            background: "var(--surface-paper)",
            color: "var(--ink-primary)",
            fontSize: 12.5,
            fontFamily: "var(--font-mono, ui-monospace), monospace",
            minWidth: 280,
          }}
        />
        <span role="radiogroup" aria-label="OData version" style={{ display: "inline-flex", gap: 8, fontFamily: "inherit" }}>
          {ODATA_VERSIONS.map((v) => (
            <label key={v} style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
              <input
                type="radio"
                name="service-odata-version"
                value={v}
                checked={draftVersion === v}
                onChange={() => {
                  setDraftVersion(v);
                  setVersionTouched(true);
                }}
              />
              OData {v}
            </label>
          ))}
        </span>
        <button
          type="button"
          style={linkBtn}
          disabled={busy || normalized === null || (!pathChanged && !versionChanged)}
          onClick={() => normalized !== null && onSave(change)}
        >
          Save
        </button>
        <button
          type="button"
          style={linkBtn}
          disabled={busy}
          onClick={() => {
            setDraft(value);
            setDraftVersion(version ?? inferODataVersion(value));
            setVersionTouched(false);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </span>
      {!check.ok && trimmed.length > 0 && (
        <span style={{ fontSize: 11, color: "var(--status-revoked-fg)", fontFamily: "inherit" }}>{check.message}</span>
      )}
      <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-muted)", fontFamily: "inherit", maxWidth: 420 }}>
        Saving a new path or OData version creates a new interface version, clears verification, and returns an
        active write interface to draft. A new path also detaches existing access grants (they name the old
        path): an active read interface stays active but its calls are refused until a grant for the new path
        is approved. A version change alone keeps the grants attached.
      </span>
    </span>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--brand-navy)",
  cursor: "pointer",
  textDecoration: "underline",
};

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 20,
};

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: 16, lineHeight: "24px", fontWeight: 600 };
const body: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" };
const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };
const code: React.CSSProperties = { background: "var(--surface-ink-tint)", borderRadius: 4, padding: "1px 5px", fontSize: 12 };

const btnPrimary: React.CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--brand-navy)", color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)", color: "var(--ink-primary)",
  border: "1px solid var(--border-strong)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
