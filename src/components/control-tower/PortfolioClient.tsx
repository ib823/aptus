"use client";

/**
 * Solution portfolio — what exists, and whether anyone is accountable for it.
 *
 * OWNERSHIP IS THE COLUMN THIS SCREEN IS FOR. A solution with an incomplete
 * owner set is not a form with a gap; it is a thing nobody can be asked about,
 * and the product already refuses to promote it or issue a credential for it.
 * So the missing slots are NAMED — "2 of 3 owners" tells a reviewer nothing
 * about who to chase.
 *
 * `dataClass` IS A DECLARATION AND IS RENDERED AS ONE. It is a closed vocabulary
 * now rather than free text, which makes the values comparable — but it still
 * gates nothing anywhere in the platform. Sitting in a column beside status and
 * ownership it would read as an enforced classification, so it is visually
 * quieter than its neighbours and the strip says outright that nothing reads it.
 * Borrowed authority is the subtlest way a governance screen lies.
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
  type OpsTone,
} from "@/components/ops/OpsChrome";
import { count, FeedAsAt, useOpsFeed } from "@/components/ops/useOpsFeed";

interface Solution {
  id: string;
  name: string;
  slug: string;
  status: string;
  classification: string;
  dataClass: string;
  ownership: {
    missing: string[];
    complete: boolean;
  };
  interfaces: number;
  hasLiveCredential: boolean;
}

interface PortfolioPayload {
  counts: {
    total: number;
    byStatus: Record<string, number>;
    unowned: number;
    withLiveCredential: number;
  };
  provenance: {
    dataClassIsNotEnforced: string;
    ownershipGatesIssuance: string;
    countsAreComplete: string;
  };
  solutions: Solution[];
}

const STATUS: Record<string, OpsTone> = {
  ACTIVE: "good",
  DRAFT: "neutral",
  RESTRICTED: "attention",
  RETIRED: "muted",
};

export function PortfolioClient() {
  const { feed, fetchedAt } = useOpsFeed<PortfolioPayload>("/api/control-tower/portfolio");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Solution portfolio"
        lede="Every registered solution, and whether it is accountable. A solution cannot be promoted to ACTIVE or issued a runtime credential until all three owner slots are filled."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="The portfolio could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <PortfolioBody data={feed.data} />
      )}
    </div>
  );
}

function PortfolioBody({ data }: { data: PortfolioPayload }) {
  const { counts, solutions, provenance } = data;

  return (
    <OpsCard>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat label="Solutions" value={count(counts.total)} basis="every one in scope" />
        <Stat label="Active" value={count(counts.byStatus.ACTIVE ?? 0)} />
        <Stat
          label="Without full ownership"
          value={count(counts.unowned)}
          basis="cannot be promoted or credentialled"
          tone={counts.unowned > 0 ? "attention" : "default"}
        />
        <Stat label="With a live credential" value={count(counts.withLiveCredential)} />
      </div>

      {solutions.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          title="No solution registered"
          detail="Nothing has been registered for this organization yet. Registration happens in Developer Studio."
        />
      ) : (
        <OpsTable head={["Solution", "Status", "Accountability", "Interfaces", "Declared data class"]}>
          {solutions.map((s) => (
            <tr key={s.id}>
              <td style={opsCellStyle}>
                {s.name}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  {s.classification.toLowerCase().replace(/_/g, " ")}
                  {s.hasLiveCredential ? " · credentialled" : ""}
                </div>
              </td>
              <td style={opsCellStyle}>
                <OpsChip tone={STATUS[s.status] ?? "muted"} label={s.status.toLowerCase()} />
              </td>
              <td style={opsCellStyle}>
                {s.ownership.complete ? (
                  <OpsChip
                    tone="good"
                    label="all three owners"
                    meaning="technical, business and support owners are all claimed"
                  />
                ) : (
                  // Named, not counted. A reviewer needs to know who to chase.
                  <OpsChip
                    tone="attention"
                    label={`no ${s.ownership.missing.join(", no ")}`}
                    meaning="issuance and promotion are both blocked until every slot is claimed"
                  />
                )}
              </td>
              <td style={opsCellStyle}>
                {s.interfaces === 0 ? (
                  <AbsencePill label="none yet" meaning="no capability has been added to this solution" />
                ) : (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{count(s.interfaces)}</span>
                )}
              </td>
              <td style={{ ...opsCellStyle, color: "var(--ink-muted)", fontSize: 12.5 }}>
                {/* Quieter than its neighbours on purpose — it gates nothing. */}
                {s.dataClass || "—"}
              </td>
            </tr>
          ))}
        </OpsTable>
      )}

      <ProvenanceStrip claim="Declared, not enforced">
        {provenance.dataClassIsNotEnforced}
        <div style={{ marginTop: 6 }}>{provenance.ownershipGatesIssuance}</div>
        <div style={{ marginTop: 6 }}>{provenance.countsAreComplete}</div>
      </ProvenanceStrip>
    </OpsCard>
  );
}
