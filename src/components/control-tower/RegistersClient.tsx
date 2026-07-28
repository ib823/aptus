"use client";

/**
 * The two governance registers — credentials and connections.
 *
 * ONE FILE BECAUSE THEY ANSWER ONE QUESTION in two places: was this thing
 * created and configured accountably, and who may change it now? Both surface a
 * control that genuinely exists and is gated to the CONSULTANT role, so a
 * platform admin — this workspace's owner — receives a 403 from it. Both render
 * it visible-but-disabled with its real label, and both put the reason in the
 * provenance strip rather than a tooltip: a tooltip needs a hover to discover
 * and is unreachable by keyboard on a disabled control.
 *
 * THESE ARE CENSUSES. Every row in scope is listed, and the connection register
 * deliberately INCLUDES deactivated connections where the Operations Center's
 * health view excludes them. A deactivated connection has no health worth
 * reporting and is still part of the estate someone is accountable for.
 */

import {
  AbsencePill,
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  Stat,
  opsCellStyle,
  opsMonoStyle,
  type OpsTone,
} from "@/components/ops/OpsChrome";
import { count, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";
import {
  DelegatedAction,
  ExpiryRunway,
  SegregationVerdict,
} from "@/components/control-tower/GovernanceChrome";

interface DelegatedActionSpec {
  id: string;
  label: string;
  availableTo: string;
  where: string;
  why: string;
}

/* ────────────────────────────  credentials  ──────────────────────────── */

interface RegisterCredential {
  id: string;
  solutionId: string;
  solutionName: string | null;
  label: string;
  environment: string;
  state: "active" | "expired" | "revoked";
  segregation: { issuerWasAnOwner: boolean; ownershipComplete: boolean } | null;
  lastObservedUseAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface CredentialsPayload {
  counts: {
    total: number;
    active: number;
    revoked: number;
    expired: number;
    withWriteSecret: number;
    issuedByAnOwner: number;
    neverExpires: number;
  };
  delegatedActions: DelegatedActionSpec[];
  provenance: {
    oneCredentialPerSolution: string;
    segregationIsRecorded: string;
    lastUsedUnderReports: string;
    countsAreComplete: string;
  };
  credentials: RegisterCredential[];
}

const CRED_STATE: Record<RegisterCredential["state"], OpsTone> = {
  active: "good",
  expired: "muted",
  revoked: "bad",
};

export function CredentialRegisterClient() {
  const { feed } = useOpsFeed<CredentialsPayload>("/api/control-tower/tokens");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Credential register"
        lede="Every runtime credential ever issued, and whether issuing it was accountable. Issuance requires all three owners and refuses anyone who is themselves an owner — this is where a reviewer confirms that held."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder
            kind="error"
            title="The credential register could not be read"
            detail={feed.message}
          />
        </OpsCard>
      ) : (
        <CredentialsBody data={feed.data} />
      )}
    </div>
  );
}

function CredentialsBody({ data }: { data: CredentialsPayload }) {
  const { counts, credentials, provenance, delegatedActions } = data;
  const action = delegatedActions[0];

  return (
    <OpsCard>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat label="Credentials" value={count(counts.total)} basis="every one in scope" />
        <Stat label="Active" value={count(counts.active)} />
        <Stat
          label="Issued by an owner"
          value={count(counts.issuedByAnOwner)}
          // Should be zero. A non-zero is a control that did not hold — so it
          // is shown always, not only when non-zero, and reads as a finding.
          basis="should be zero — issuance refuses an owner"
          tone={counts.issuedByAnOwner > 0 ? "attention" : "default"}
        />
        <Stat
          label="Never expires"
          value={count(counts.neverExpires)}
          basis="active, with no end date"
        />
      </div>

      {credentials.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          title="No credential has been issued"
          detail="Nothing can call the broker for this organization. Issuance needs a solution with all three owners, and a second person to perform it."
        />
      ) : (
        <OpsTable
          head={["Credential", "Environment", "State", "Segregation of duties", "Ends", "Action"]}
        >
          {credentials.map((c) => (
            <tr key={c.id}>
              <td style={opsCellStyle}>
                {c.solutionName ?? c.label}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  issued {sinceLabel(c.createdAt)}
                </div>
              </td>
              <td style={opsCellStyle}>
                <OpsChip
                  tone={c.environment.toUpperCase() === "PROD" ? "attention" : "info"}
                  label={c.environment}
                />
              </td>
              <td style={opsCellStyle}>
                <OpsChip tone={CRED_STATE[c.state]} label={c.state} />
              </td>
              <td style={opsCellStyle}>
                <SegregationVerdict segregation={c.segregation} />
              </td>
              <td style={opsCellStyle}>
                {/* A credential's expiry is not a grant's: an unbounded read
                    credential is normal, so no expiry is an absence here and
                    not a defect. */}
                <ExpiryRunway expiresAt={c.expiresAt} unboundedIsLegitimate />
              </td>
              <td style={{ ...opsCellStyle, textAlign: "right" }}>
                {action ? (
                  <DelegatedAction label={action.label} availableTo={action.availableTo} />
                ) : null}
              </td>
            </tr>
          ))}
        </OpsTable>
      )}

      <ProvenanceStrip claim={action ? `${action.label} lives in ${action.where}` : "Register"}>
        {action?.why}
        <div style={{ marginTop: 6 }}>{provenance.segregationIsRecorded}</div>
        <div style={{ marginTop: 6 }}>{provenance.oneCredentialPerSolution}</div>
        <div style={{ marginTop: 6 }}>
          {provenance.lastUsedUnderReports} {provenance.countsAreComplete}
        </div>
      </ProvenanceStrip>
    </OpsCard>
  );
}

/* ────────────────────────────  connections  ──────────────────────────── */

interface RegisterConnection {
  id: string;
  product: string;
  key: string;
  label: string;
  environment: string | null;
  authType: string;
  writeEnabled: boolean;
  isActive: boolean;
  status: string;
  neverTested: boolean;
  lastValidatedAt: string | null;
}

interface FallbackTenant {
  key: string;
  label: string;
  product: string;
  environment: string | null;
}

interface ConnectionsPayload {
  deploymentFallback: { inUse: boolean; tenants: FallbackTenant[] };
  counts: {
    total: number;
    active: number;
    inactive: number;
    writeEnabled: number;
    prod: number;
    undeclaredEnvironment: number;
  };
  delegatedActions: DelegatedActionSpec[];
  provenance: {
    fallbackIsShared: string | null;
    includesInactive: string;
    everyConnectionIsSealed: string;
    secretsAreNeverRead: string;
    environmentGatesWrites: string;
    countsAreComplete: string;
  };
  connections: RegisterConnection[];
}

export function ConnectionRegisterClient() {
  const { feed } = useOpsFeed<ConnectionsPayload>("/api/control-tower/connections");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Connection register"
        lede="Every SAP connection in the estate, active or not — which landscape it claims to be, and who may write through it. This is the governance view; live probe health is in the Operations Center."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder
            kind="error"
            title="The connection register could not be read"
            detail={feed.message}
          />
        </OpsCard>
      ) : (
        <ConnectionsBody data={feed.data} />
      )}
    </div>
  );
}

function ConnectionsBody({ data }: { data: ConnectionsPayload }) {
  const { counts, connections, provenance, delegatedActions } = data;
  const action = delegatedActions[0];

  return (
    <OpsCard>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat label="Connections" value={count(counts.total)} basis={`${counts.inactive} deactivated`} />
        <Stat
          label="Write enabled"
          value={count(counts.writeEnabled)}
          tone={counts.writeEnabled > 0 ? "attention" : "default"}
        />
        <Stat label="Production" value={count(counts.prod)} />
        <Stat
          label="Undeclared environment"
          value={count(counts.undeclaredEnvironment)}
          basis="writes refused through these"
          tone={counts.undeclaredEnvironment > 0 ? "attention" : "default"}
        />
      </div>

      {data.deploymentFallback.inUse ? (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span style={{ flex: "none", paddingTop: 1 }}>
            <OpsChip
              tone="info"
              label="deployment tenant in use"
              meaning="this organization has stored no connection, so traffic falls back to a shared tenant"
            />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
              {data.provenance.fallbackIsShared}
            </p>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.deploymentFallback.tenants.map((t) => (
                <span
                  key={`${t.product}:${t.key}`}
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  {t.product} · {t.key}
                  {t.environment ? ` · ${t.environment}` : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {connections.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          // Precise about WHOSE estate is empty. Whether anything reaches SAP is
          // answered by the fallback note above, not by this sentence.
          title="This organization has registered no SAP connection"
          detail={
            data.deploymentFallback.inUse
              ? "Its traffic runs on the deployment's shared tenant, which is governed at the deployment level rather than here. Connections are registered in Developer Studio."
              : "Nothing is registered, and the deployment has no fallback tenant either. Connections are added in Developer Studio."
          }
        />
      ) : (
        <OpsTable head={["Connection", "Environment", "Write", "Last succeeded", "Action"]}>
          {connections.map((c) => (
            <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.62 }}>
              <td style={opsCellStyle}>
                {c.label}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  {c.product} · {c.key} · {c.authType}
                  {c.isActive ? "" : " · deactivated"}
                </div>
              </td>
              <td style={opsCellStyle}>
                {c.environment ? (
                  <OpsChip
                    tone={c.environment.toUpperCase() === "PROD" ? "attention" : "info"}
                    label={c.environment}
                  />
                ) : (
                  <AbsencePill
                    label="not declared"
                    meaning="reads are served but marked unverified; writes are refused outright"
                  />
                )}
              </td>
              <td style={opsCellStyle}>
                {c.writeEnabled ? (
                  <OpsChip
                    tone="attention"
                    label="enabled"
                    meaning="writes may be made through this connection when a grant permits"
                  />
                ) : (
                  <OpsChip tone="muted" label="off" meaning="no write can be made through this connection" />
                )}
              </td>
              <td style={opsMonoStyle}>
                {c.neverTested ? (
                  <AbsencePill label="never tested" meaning="no probe has run against this connection" />
                ) : (
                  sinceLabel(c.lastValidatedAt)
                )}
              </td>
              <td style={{ ...opsCellStyle, textAlign: "right" }}>
                {action ? (
                  <DelegatedAction label={action.label} availableTo={action.availableTo} />
                ) : null}
              </td>
            </tr>
          ))}
        </OpsTable>
      )}

      <ProvenanceStrip claim={action ? `${action.label} lives in ${action.where}` : "Register"}>
        {action?.why}
        <div style={{ marginTop: 6 }}>{provenance.includesInactive}</div>
        <div style={{ marginTop: 6 }}>
          {provenance.everyConnectionIsSealed} {provenance.secretsAreNeverRead}
        </div>
        <div style={{ marginTop: 6 }}>
          {provenance.environmentGatesWrites} {provenance.countsAreComplete}
        </div>
      </ProvenanceStrip>
    </OpsCard>
  );
}
