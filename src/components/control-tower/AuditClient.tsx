"use client";

/**
 * Governance audit — what changed, who changed it, when.
 *
 * NOT A DIFF VIEWER, AND THE SCREEN SAYS SO. `ConfigAudit` stores before/after
 * snapshots, and the endpoint deliberately does not return them: they hold whole
 * entity records that can carry fields this workspace has no business
 * projecting, and no amount of careful rendering would reliably redact them. So
 * the trail reports the event, not its contents.
 *
 * That limit is stated in the strip rather than left to look like an empty diff.
 * A reviewer who expects to see what changed and finds nothing concludes the
 * record is thin; a reviewer told the snapshots exist and are withheld knows to
 * ask for one deliberately.
 *
 * AN EMPTY TRAIL IS NOT A CLAIM THAT NOTHING HAPPENED. It records governed
 * configuration only — solutions, interfaces, connections, grants. It is not an
 * application log and does not record reads.
 */

import { useState } from "react";

import {
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
import { count, sinceLabel, useOpsFeed, OpsWindowPicker } from "@/components/ops/useOpsFeed";
import { formatDateTime } from "@/lib/format/date";

interface Entry {
  id: string;
  at: string;
  actorId: string;
  /** Resolved at read time; null when the id resolves to nothing. */
  actorLabel: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: string;
}

interface AuditPayload {
  windowHours: number;
  counts: { total: number; byAction: Record<string, number>; byEntity: Record<string, number> };
  knownActions: string[];
  truncated: boolean;
  provenance: {
    appendOnly: string;
    diffsNotReturned: string;
    coversGovernedConfigOnly: string;
    entriesAreAPage: { returned: number; limit: number; of: number };
  };
  entries: Entry[];
}

/**
 * A decision is the governance event; the rest are configuration changes.
 * ISSUE and ROTATE are credential-lifecycle events — added to the audit
 * vocabulary precisely so minting a live token is distinguishable from a
 * rename, and given the attention tone here for the same reason. Leaving them
 * out let them fall through to `muted`, visually demoting the one event class
 * the vocabulary was extended to surface.
 */
const ACTION: Record<string, OpsTone> = {
  DECISION: "attention",
  ISSUE: "attention",
  ROTATE: "attention",
  PROMOTE: "good",
  CREATE: "info",
  UPDATE: "neutral",
  TEST_CONNECT: "muted",
};

/**
 * A governance trail defaults to 30 days, not the Ops screens' 24 hours.
 *
 * The route has defaulted to 30 days since it shipped — and that default was
 * dead code, because useOpsFeed always appended `hours=24` and this screen
 * never offered a way to change it. "Who approved this last month?" — the
 * question an audit trail exists for — was unanswerable from the UI.
 */
const AUDIT_DEFAULT_WINDOW_HOURS = 24 * 30;

export function AuditClient() {
  const [entityType, setEntityType] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(AUDIT_DEFAULT_WINDOW_HOURS);
  const query = entityType ? `?entityType=${encodeURIComponent(entityType)}` : "";
  const { feed } = useOpsFeed<AuditPayload>(`/api/control-tower/audit${query}`, windowHours);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Governance audit"
        lede="Every change to governed configuration — who made it and when. Append-only: no entry can be amended, including from here."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="The audit trail could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <AuditBody
          data={feed.data}
          entityType={entityType}
          onFilter={setEntityType}
          onWindowChange={setWindowHours}
        />
      )}
    </div>
  );
}

function AuditBody({
  data,
  entityType,
  onFilter,
  onWindowChange,
}: {
  data: AuditPayload;
  entityType: string | null;
  onFilter: (v: string | null) => void;
  onWindowChange: (hours: number) => void;
}) {
  const { counts, entries, provenance, windowHours } = data;
  const page = provenance.entriesAreAPage;
  const entityTypes = Object.keys(counts.byEntity).sort();

  const filterBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--brand-navy)" : "var(--border-default)"}`,
    background: active ? "var(--brand-navy-soft, #E6EBF1)" : "var(--surface-paper)",
    color: active ? "var(--brand-navy)" : "var(--ink-secondary)",
  });

  return (
    <OpsCard>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px 0" }}>
        <OpsWindowPicker id="ct-window-audit" hours={windowHours} onChange={onWindowChange} />
      </div>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat
          label="Entries"
          value={count(counts.total)}
          // Sub-day windows must not render "last 0 days".
          basis={windowHours < 48 ? `last ${windowHours} hours` : `last ${Math.round(windowHours / 24)} days`}
        />
        <Stat
          label="Decisions"
          value={count(counts.byAction.DECISION ?? 0)}
          basis="access grants settled"
        />
        <Stat label="Promotions" value={count(counts.byAction.PROMOTE ?? 0)} />
      </div>

      {entityTypes.length > 1 ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "0 16px 13px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button type="button" style={filterBtn(entityType === null)} onClick={() => onFilter(null)}>
            Everything
          </button>
          {entityTypes.map((t) => (
            <button key={t} type="button" style={filterBtn(entityType === t)} onClick={() => onFilter(t)}>
              {t} · {count(counts.byEntity[t] ?? 0)}
            </button>
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          title={entityType ? `No ${entityType} changes in this window` : "No governed change in this window"}
          // Never "nothing happened" — this records configuration, not activity.
          detail="This records changes to governed configuration — solutions, interfaces, connections and grants. It is not an application log and does not record reads, so an empty window means no configuration changed, not that nothing occurred."
        />
      ) : (
        <OpsTable head={["When", "Action", "Entity", "Actor"]}>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={opsMonoStyle}>
                {sinceLabel(e.at)}
                <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                  {formatDateTime(e.at)}
                </div>
              </td>
              <td style={opsCellStyle}>
                <OpsChip
                  tone={ACTION[e.action] ?? "muted"}
                  label={e.action.toLowerCase().replace(/_/g, " ")}
                />
              </td>
              <td style={opsCellStyle}>
                {e.entityLabel ? `${e.entityType} · ${e.entityLabel}` : e.entityType}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                  }}
                >
                  {/* The id stays visible beneath the label: it is the
                      citable evidence, and it does not change when someone
                      renames a solution. */}
                  {e.entityId}
                </div>
              </td>
              <td style={opsCellStyle}>
                {e.actorLabel ? (
                  <>
                    <div style={{ fontSize: 12.5 }}>{e.actorLabel}</div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 11.5,
                        color: "var(--ink-muted)",
                      }}
                    >
                      {e.actorId}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
                      unknown actor
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 11.5,
                        color: "var(--ink-muted)",
                      }}
                    >
                      {e.actorId}
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </OpsTable>
      )}

      <ProvenanceStrip claim="The event, not its contents">
        {provenance.diffsNotReturned}
        <div style={{ marginTop: 6 }}>{provenance.appendOnly}</div>
        <div style={{ marginTop: 6 }}>
          {provenance.coversGovernedConfigOnly}
          {page.of > 0 ? ` Showing ${count(page.returned)} of ${count(page.of)} entries.` : ""}
        </div>
      </ProvenanceStrip>
    </OpsCard>
  );
}
