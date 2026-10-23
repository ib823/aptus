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
import { count, FeedAsAt, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";
import { ProductLabel } from "@/components/sap/ProductLabel";
import {
  DelegatedAction,
  ExpiryRunway,
  SegregationVerdict,
} from "@/components/control-tower/GovernanceChrome";
import { NO_EXPIRY_LABEL, NO_EXPIRY_MEANING } from "@/lib/northbound/key-policy";

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
  /** TEST and PROD keys must expire (P0.11); absent from an older payload. */
  expiryRequired?: boolean;
  /** A live key that must expire and does not. */
  lacksRequiredExpiry?: boolean;
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
    noRequiredExpiry?: number;
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
  const { feed, fetchedAt } = useOpsFeed<CredentialsPayload>("/api/control-tower/tokens");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Credential register"
        lede="Every runtime credential ever issued, and whether issuing it was accountable. Issuance requires all three owners and refuses anyone who is themselves an owner — this is where a reviewer confirms that held."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

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
        <Stat
          label="No expiry - set one"
          value={count(counts.noRequiredExpiry ?? 0)}
          basis="TEST or PROD keys, which must now expire — rotate to set one"
          tone={(counts.noRequiredExpiry ?? 0) > 0 ? "attention" : "default"}
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
                {/*
                  CREDENTIAL LABEL FIRST, solution beneath.

                  This showed `solutionName ?? label` while the Operations
                  Center's Throttle view showed `label`, so one credential
                  appeared as "QA-Delivery-Tracker" here and
                  "QA-Cred-SANDBOX-NoMatch" there. During an incident you hold a
                  credential and need to find it on the other screen; two names
                  for one row makes that impossible. Both screens now lead with
                  the credential's own label and name its solution beneath.
                */}
                {c.label}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  {c.solutionName ?? c.solutionId} · issued {sinceLabel(c.createdAt)}
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
                {/* SANDBOX and DEV keys may run without an expiry, so there no
                    expiry is an absence and not a defect. A TEST or PROD key
                    must expire (P0.11): one without is flagged until rotated. */}
                {c.lacksRequiredExpiry ? (
                  <OpsChip tone="attention" label={NO_EXPIRY_LABEL} meaning={NO_EXPIRY_MEANING} />
                ) : (
                  <ExpiryRunway expiresAt={c.expiresAt} unboundedIsLegitimate />
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
  /** Apps reach SAP through the broker only when this is true: an ACTIVE connection exists (P0.3, A59). */
  brokerReachable: boolean;
  /** The deployment's env tenant: console and explorer reads for everyone, never the broker. */
  deploymentTenant: { configured: boolean; servesBroker: false; tenants: FallbackTenant[] };
  counts: {
    total: number;
    active: number;
    inactive: number;
    writeEnabled: number;
    prod: number;
  prodInactive: number;
    undeclaredEnvironment: number;
  undeclaredEnvironmentInactive: number;
  };
  delegatedActions: DelegatedActionSpec[];
  provenance: {
    deploymentTenantScope: string | null;
    brokerReachability: string | null;
    includesInactive: string;
    everyConnectionIsSealed: string;
    secretsAreNeverRead: string;
    environmentGatesWrites: string;
    countsAreComplete: string;
  };
  connections: RegisterConnection[];
}

export function ConnectionRegisterClient() {
  const { feed, fetchedAt } = useOpsFeed<ConnectionsPayload>("/api/control-tower/connections");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Connection register"
        lede="Every SAP connection in the estate, active or not — which landscape it claims to be, and who may write through it. This is the governance view; live probe health is in the Operations Center."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

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
        <Stat
          label="Production"
          value={count(counts.prod)}
          basis={
            counts.prodInactive > 0
              ? `active only · ${counts.prodInactive} deactivated PROD row${counts.prodInactive === 1 ? "" : "s"} below`
              : "active only"
          }
        />
        <Stat
          label="Undeclared environment"
          value={count(counts.undeclaredEnvironment)}
          basis={
            counts.undeclaredEnvironmentInactive > 0
              ? `active only · ${counts.undeclaredEnvironmentInactive} deactivated below`
              : "active only · writes refused through these"
          }
          tone={counts.undeclaredEnvironment > 0 ? "attention" : "default"}
        />
      </div>

      {/* Two facts, neither derived from the other (P0.3, A59): whether the
          broker can reach SAP for this organization's apps, and what the
          deployment's env tenant serves — console reads only. */}
      {!data.brokerReachable && data.provenance.brokerReachability ? (
        <p
          role="status"
          style={{ margin: 0, padding: "12px 16px", borderBottom: "1px solid var(--border-default)", fontSize: 12.5, lineHeight: 1.55, color: "var(--status-awaiting-fg)" }}
        >
          {data.provenance.brokerReachability}
        </p>
      ) : null}
      {data.deploymentTenant.configured ? (
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
              label="deployment tenant: console reads only"
              meaning="serves console and explorer reads for every organization; the broker never uses it"
            />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
              {data.provenance.deploymentTenantScope}
            </p>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.deploymentTenant.tenants.map((t) => (
                <span
                  key={`${t.product}:${t.key}`}
                  style={{ fontSize: 11.5, color: "var(--ink-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <ProductLabel product={t.product} size={14} />
                  <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    · {t.key}
                    {t.environment ? ` · ${t.environment}` : ""}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {connections.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          // Precise about WHOSE estate is empty. What the deployment's tenant
          // serves is answered by the note above, not by this sentence.
          title="This organization has registered no SAP connection"
          detail={
            data.deploymentTenant.configured
              ? "Its apps' calls through the broker are refused until a connection is registered in Developer Studio. The deployment's tenant serves console reads only and never stands in for one."
              : "Its apps' calls through the broker are refused until a connection is registered in Developer Studio, and the deployment has no tenant of its own either."
          }
        />
      ) : (
        <OpsTable head={["Connection", "Environment", "Write", "Last succeeded", "Action"]}>
          {connections.map((c) => (
            <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.62 }}>
              <td style={opsCellStyle}>
                {c.label}
                {/* Name in ordinary type; key and authType stay mono because
                    those two ARE the configured values, and the name is not. */}
                <div style={{ fontSize: 11.5, color: "var(--ink-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <ProductLabel product={c.product} size={14} />
                  <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    · {c.key} · {c.authType}
                    {c.isActive ? "" : " · deactivated"}
                  </span>
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
