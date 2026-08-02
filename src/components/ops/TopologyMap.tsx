"use client";

/**
 * The Console topology — what is wired to what, on a workspace's home page.
 *
 * THE ENCODING IS THE DESIGN, and it is orthogonal on purpose:
 *
 *   glyph  carries STATE      ✓ observed-good · ✕ observed-bad
 *                             ∅ never-observed · — unobservable · ▲ defect
 *   border carries ENDEDNESS  solid = live · dashed = ended, nothing more flows
 *
 * Keeping them separate is what lets a revoked grant that CARRIED traffic read
 * differently from one nobody ever used. Collapsing them — the obvious
 * simplification — would make the first assert that no call ever ran under it,
 * which the platform cannot know and which is usually false.
 *
 * A glyph rather than colour alone: this gets screenshotted into documents, and
 * a reader with no legend still has to be able to tell a never-probed
 * connection from a healthy one.
 *
 * MOTION MEANS A RECORDED EVENT. There is no idle "alive" pulse, because the
 * platform genuinely cannot assert that anything is alive: a blank probe means
 * nobody has asked, `lastUsedAt` is fire-and-forget, and two throttle buckets
 * can never be observed at all. An edge animates only when the audit feed
 * recorded calls along it in the window, and even then the count is a floor.
 *
 * NO SUMMARY, NO SCORE. The Operations home's argument holds here: a second
 * copy of a number is a thing that disagrees with the screen that owns it. Every
 * node links to its authoritative screen instead, in that workspace's own
 * vocabulary — "Connections" in Studio, "Connection register" in Control Tower.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OPS_WINDOWS } from "@/components/ops/useOpsFeed";
import type { Lens, NodeState, TopologyEdge, TopologyNode } from "@/lib/ops/topology";

interface Payload {
  lens: Lens;
  windowHours: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  collapsed: { column: number; count: number }[];
  provenance: { feedIsAFloor: string; grantAttribution: string; noSummary: string };
}

const COLUMN_LABELS = [
  "Caller",
  "Credential",
  "Grant",
  "Interface",
  "Connection",
  "SAP tenant",
] as const;

const STATE: Record<NodeState, { glyph: string; label: string; fg: string; bg: string }> = {
  "observed-good": {
    glyph: "✓",
    label: "Observed good",
    fg: "var(--status-signed-fg)",
    bg: "var(--status-signed-bg)",
  },
  "observed-bad": {
    glyph: "✕",
    label: "Observed bad",
    fg: "var(--status-revoked-fg)",
    bg: "var(--status-revoked-bg)",
  },
  "never-observed": {
    glyph: "∅",
    label: "Never observed",
    fg: "var(--status-nocheck-fg)",
    bg: "var(--status-nocheck-bg)",
  },
  unobservable: {
    glyph: "—",
    label: "Unobservable",
    fg: "var(--status-expired-fg)",
    bg: "var(--status-expired-bg)",
  },
  defect: {
    glyph: "▲",
    label: "Defect",
    fg: "var(--status-awaiting-fg)",
    bg: "var(--status-awaiting-bg)",
  },
};

const NODE_W = 150;
const NODE_H = 62;
const COL_GAP = 34;
const ROW_GAP = 14;

export function TopologyMap({ lens }: { lens: Lens }) {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/console/topology?lens=${lens}&hours=${hours}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`The topology could not be loaded (${res.status}).`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json.data as Payload);
      })
      .catch((e: Error) => {
        // Surfaced, never swallowed — an empty canvas that looks like an empty
        // tenant is the one failure this screen must not have.
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lens, hours]);

  const columns = useMemo(() => {
    const map = new Map<number, TopologyNode[]>();
    for (const n of data?.nodes ?? []) map.set(n.column, [...(map.get(n.column) ?? []), n]);
    return map;
  }, [data]);

  const ordered = useMemo(
    () => [...(data?.nodes ?? [])].sort((a, b) => a.column - b.column),
    [data],
  );

  /** Arrow keys walk the graph; Enter opens the authoritative screen. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!ordered.length) return;
      const i = ordered.findIndex((n) => n.id === focused);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = e.key === "ArrowRight" ? Math.min(i + 1, ordered.length - 1) : Math.max(i - 1, 0);
        setFocused(ordered[i === -1 ? 0 : next]?.id ?? null);
      }
    },
    [ordered, focused],
  );

  const hovered = data?.nodes.find((n) => n.id === focused) ?? null;
  const liveEdges = (data?.edges ?? []).filter((e) => e.calls > 0 && !e.inert);

  if (loading) {
    return <Frame lens={lens} hours={hours} onHours={setHours}><Muted>Loading the topology…</Muted></Frame>;
  }

  if (error) {
    return (
      <Frame lens={lens} hours={hours} onHours={setHours}>
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--cta-red)" }}>
          {error} Nothing is being claimed about this tenant — this is a failure to load, not an
          empty estate.
        </p>
      </Frame>
    );
  }

  const isEmpty = (data?.nodes ?? []).every((n) => n.kind === "caller" || n.kind === "tenant");

  return (
    <Frame lens={lens} hours={hours} onHours={setHours}>
      {isEmpty ? (
        /*
         * THE HARDEST STATE TO GET RIGHT. A new tenant has no solutions, no
         * grants and no connections. That must read as "nothing is set up",
         * never as "everything is fine" — an empty graph is not a green graph.
         */
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: "21px", color: "var(--ink-secondary)" }}>
          Nothing is registered for this organization yet — no solutions, no interfaces, no
          connections. There is nothing here to observe, so this screen makes no claim about
          health. Register a solution in Developer Studio to begin.
        </p>
      ) : (
        <>
          <div
            ref={containerRef}
            role="application"
            aria-label={`Topology for ${lens}. Use arrow keys to move between components.`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            style={{
              display: "flex",
              gap: COL_GAP,
              alignItems: "flex-start",
              overflowX: "auto",
              padding: "4px 2px 14px",
              minHeight: 320,
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((col) => {
              const list = columns.get(col) ?? [];
              const folded = data?.collapsed.find((c) => c.column === col);
              return (
                <div key={col} style={{ display: "flex", flexDirection: "column", gap: ROW_GAP, flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: ".09em",
                      fontWeight: 700,
                      color: "var(--ink-muted)",
                      marginBottom: 2,
                    }}
                  >
                    {COLUMN_LABELS[col]}
                  </div>
                  {list.map((n) => (
                    <NodeBox
                      key={n.id}
                      node={n}
                      active={focused === n.id}
                      onEnter={() => setFocused(n.id)}
                    />
                  ))}
                  {folded ? (
                    // Never a silent truncation — the count is the point.
                    <div
                      style={{
                        width: NODE_W,
                        padding: "8px 10px",
                        border: "1px dashed var(--border-strong)",
                        borderRadius: 8,
                        fontSize: 11.5,
                        color: "var(--ink-muted)",
                        background: "var(--surface-cream)",
                      }}
                    >
                      +{folded.count} more not shown. Defects and rows that carried traffic are kept
                      first.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <Provenance node={hovered} payload={data} liveEdgeCount={liveEdges.length} />
          <Legend />
        </>
      )}
    </Frame>
  );
}

function NodeBox({
  node,
  active,
  onEnter,
}: {
  node: TopologyNode;
  active: boolean;
  onEnter: () => void;
}) {
  const s = STATE[node.state];
  const ended = node.ended != null;
  return (
    <Link
      href={node.href}
      onMouseEnter={onEnter}
      onFocus={onEnter}
      aria-current={active ? "true" : undefined}
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        display: "block",
        padding: "8px 10px",
        borderRadius: 8,
        textDecoration: "none",
        background: node.quiet ? "var(--surface-cream)" : s.bg,
        // Endedness is the stroke; state is the glyph. Independent by design.
        border: `1.5px ${ended ? "dashed" : "solid"} ${active ? "var(--brand-navy)" : "var(--border-strong)"}`,
        opacity: ended ? 0.72 : 1,
        color: "var(--ink-primary)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, color: node.quiet ? "var(--ink-muted)" : s.fg }}>
          {s.glyph}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.label}
        </span>
      </span>
      {/* The state is spelled out for a screen reader; the glyph is decorative. */}
      <span className="sr-only">{s.label}{ended ? `, ended (${node.ended?.kind})` : ""}</span>
      {node.badge ? (
        <span
          style={{
            display: "inline-block",
            marginTop: 5,
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            background: "var(--surface-paper)",
            color: node.quiet ? "var(--ink-muted)" : s.fg,
            border: "1px solid var(--border-default)",
          }}
        >
          {node.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Provenance({
  node,
  payload,
  liveEdgeCount,
}: {
  node: TopologyNode | null;
  payload: Payload | null;
  liveEdgeCount: number;
}) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: "12px 14px",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid var(--brand-navy)",
        borderRadius: "0 6px 6px 0",
        background: "var(--surface-paper)",
        fontSize: 12.5,
        lineHeight: "19px",
        color: "var(--ink-secondary)",
        minHeight: 74,
      }}
      aria-live="polite"
    >
      {node ? (
        <>
          <strong style={{ color: "var(--ink-primary)" }}>{node.label}</strong>
          <div style={{ marginTop: 4 }}>{node.provenance.derived}</div>
          <div style={{ marginTop: 4 }}>
            <em>Will not tell you:</em> {node.provenance.cannotTell}
          </div>
          {node.provenance.noRule ? (
            <div style={{ marginTop: 4 }}>
              <em>No incident rule watches this.</em> {node.provenance.noRule}
            </div>
          ) : null}
          {node.ended ? (
            <div style={{ marginTop: 4 }}>
              Ended ({node.ended.kind}).{" "}
              {node.ended.carried
                ? "It carried recorded traffic before it ended."
                : "No traffic was recorded under it — which is not the same as none having run."}
            </div>
          ) : null}
        </>
      ) : (
        <>
          Hover or focus a component to see what its state is derived from, and what it will not
          tell you. {payload?.provenance.feedIsAFloor}{" "}
          {liveEdgeCount === 0
            ? "No calls were recorded in this window, which is a floor rather than a count of zero."
            : `${liveEdgeCount} connection(s) between components carried recorded calls in this window.`}
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul
      style={{
        listStyle: "none",
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 18px",
        margin: "10px 0 0",
        padding: 0,
        fontSize: 11.5,
        color: "var(--ink-muted)",
      }}
    >
      {(Object.keys(STATE) as NodeState[]).map((k) => (
        <li key={k}>
          <span aria-hidden="true" style={{ fontWeight: 700, color: STATE[k].fg }}>
            {STATE[k].glyph}
          </span>{" "}
          {STATE[k].label}
        </li>
      ))}
      <li>
        <span aria-hidden="true">┄</span> dashed = ended, nothing further will flow
      </li>
    </ul>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13, color: "var(--ink-muted)" }}>{children}</p>;
}

function Frame({
  lens,
  hours,
  onHours,
  children,
}: {
  lens: Lens;
  hours: number;
  onHours: (h: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        background: "var(--surface-paper)",
        padding: 18,
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>What is wired to what</h2>
        <span style={{ fontSize: 12, color: "var(--ink-muted)", flex: 1, minWidth: 200 }}>
          {LENS_CAPTION[lens]}
        </span>
        <span style={{ display: "inline-flex", gap: 4 }}>
          {OPS_WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => onHours(w.hours)}
              aria-pressed={hours === w.hours}
              style={{
                border: "1px solid var(--border-default)",
                background: hours === w.hours ? "var(--brand-navy-soft)" : "var(--surface-paper)",
                color: hours === w.hours ? "var(--brand-navy)" : "var(--ink-secondary)",
                borderRadius: 6,
                padding: "3px 9px",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {w.label}
            </button>
          ))}
        </span>
      </header>
      {children}
    </section>
  );
}

/** Each lens reads the same graph for a different question. */
const LENS_CAPTION: Record<Lens, string> = {
  "developer-studio": "What is built, and what is half-built.",
  "operations-center": "What moved in this window — and what the feed cannot see.",
  "control-tower": "Who is accountable, and what has an end date.",
};
