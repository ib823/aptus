"use client";

/**
 * Tokens — the runtime credential fleet.
 *
 * METADATA ONLY, STRUCTURALLY. Neither the token hash nor the sealed write
 * secret is selected by the endpoint, so there is no field in this payload that
 * could become a credential. The screen does not redact anything; it never
 * receives it.
 *
 * "LAST OBSERVED USE", NOT "LAST USED". The timestamp is written
 * fire-and-forget and a serverless instance can freeze before it lands, so it
 * under-reports — and the one conclusion an operator would reach from a stale
 * value is the dangerous one: that a credential is dormant and safe to revoke.
 * The column name and the provenance strip both exist to stop that inference.
 *
 * THE COUNTS DO NOT SUM, AND THE SCREEN SAYS SO. `revoked` is counted over every
 * credential in scope; everything else is counted over the rows listed, which
 * exclude revoked ones by default. Presenting them as parts of a whole would
 * make a correct set of numbers look like an arithmetic error.
 */

import { useState } from "react";

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
import { formatDate } from "@/lib/format/date";

type CredentialState = "active" | "expiring-soon" | "expired" | "revoked";

interface Credential {
  id: string;
  solutionId: string;
  solutionName: string | null;
  solutionStatus: string | null;
  label: string;
  environment: string;
  state: CredentialState;
  lastObservedUseAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface TokensPayload {
  counts: {
    listed: number;
    active: number;
    revoked: number;
    expired: number;
    expiringSoon: number;
    neverObservedInUse: number;
    withWriteCredential: number;
  };
  provenance: {
    lastUsedUnderReports: boolean;
    countBasis: string;
    why: string;
    oneCredentialPerSolution: string;
    writeCredentials: string;
  };
  credentials: Credential[];
}

const STATE: Record<CredentialState, { tone: OpsTone; label: string; meaning: string }> = {
  active: { tone: "good", label: "active", meaning: "usable now" },
  "expiring-soon": {
    tone: "attention",
    label: "expiring soon",
    meaning: "inside the expiry runway — rotation is the only remedy",
  },
  expired: { tone: "muted", label: "expired", meaning: "stopped working on purpose, on a known date" },
  revoked: { tone: "bad", label: "revoked", meaning: "deliberately withdrawn" },
};

export function TokensClient() {
  // The endpoint always honored includeRevoked=1; the screen simply never sent
  // it, so the row a revocation investigation needs was unreachable from the
  // one place an operator would look for it.
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const { feed, fetchedAt } = useOpsFeed<TokensPayload>(
    includeRevoked ? "/api/ops/tokens?includeRevoked=1" : "/api/ops/tokens",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Tokens"
        lede="The runtime credentials issued for this organization. Metadata only — the token hash and the sealed write secret are not read by the endpoint, so nothing on this page could become a credential."
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-secondary)" }}>
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => setIncludeRevoked(e.target.checked)}
          />
          Include revoked credentials
        </label>
        <FeedAsAt fetchedAt={fetchedAt} />
      </div>

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="The credential fleet could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <TokensBody data={feed.data} />
      )}
    </div>
  );
}

function TokensBody({ data }: { data: TokensPayload }) {
  const { counts, credentials, provenance } = data;

  return (
    <OpsCard>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat label="Listed" value={count(counts.listed)} basis="excludes revoked by default" />
        <Stat label="Active" value={count(counts.active)} />
        <Stat
          label="Expiring soon"
          value={count(counts.expiringSoon)}
          tone={counts.expiringSoon > 0 ? "attention" : "default"}
        />
        <Stat
          label="Revoked"
          value={count(counts.revoked)}
          // Counted over ALL credentials, unlike its neighbours. Said here so
          // the tiles are not read as parts of one total.
          basis="over every credential in scope"
        />
        <Stat
          label="With write secret"
          value={count(counts.withWriteCredential)}
          basis="counted by presence, never read"
        />
        <Stat
          label="Never observed in use"
          value={count(counts.neverObservedInUse)}
          // The under-reporting caveat travels WITH the number: the feed misses
          // uses, so this is not a list of dormant credentials to revoke.
          basis="no use recorded — the feed under-reports"
        />
      </div>

      {credentials.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          title="No runtime credential issued"
          detail="Nothing can call the broker for this organization yet. A credential is issued per solution in Developer Studio, and requires all three owners plus a second person to issue it."
        />
      ) : (
        <OpsTable head={["Credential", "Environment", "State", "Last observed use", "Expires"]}>
          {credentials.map((c) => (
            <tr key={c.id}>
              <td style={opsCellStyle}>
                {c.solutionName ?? c.label}
                <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                  {c.solutionStatus ? `${c.solutionStatus.toLowerCase()} · ` : ""}
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
                <OpsChip
                  tone={STATE[c.state].tone}
                  label={STATE[c.state].label}
                  meaning={STATE[c.state].meaning}
                />
              </td>
              <td style={opsCellStyle}>
                {c.lastObservedUseAt === null ? (
                  // Not "never used" — that is a conclusion this feed cannot
                  // support. The absence of an observation, not the absence of
                  // a call.
                  <AbsencePill
                    label="never observed"
                    meaning="no use has been recorded — the feed under-reports, so this is not evidence the credential is dormant"
                  />
                ) : (
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--ink-secondary)" }}>
                    {sinceLabel(c.lastObservedUseAt)}
                  </span>
                )}
              </td>
              <td style={opsMonoStyle}>
                {c.expiresAt ? formatDate(c.expiresAt) : "no expiry"}
              </td>
            </tr>
          ))}
        </OpsTable>
      )}

      <ProvenanceStrip claim="Last use is under-reported">
        {provenance.why}
        <div style={{ marginTop: 6 }}>{provenance.countBasis}</div>
        <div style={{ marginTop: 6 }}>
          {provenance.oneCredentialPerSolution} {provenance.writeCredentials}
        </div>
        {credentials.length > 0 ? (
          <div style={{ marginTop: 6 }}>
            Showing all {count(counts.listed)} credential{counts.listed === 1 ? "" : "s"}.
          </div>
        ) : null}
      </ProvenanceStrip>
    </OpsCard>
  );
}
