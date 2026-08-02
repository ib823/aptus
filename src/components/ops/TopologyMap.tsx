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
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LINES
 *
 * An edge is drawn only between two things that are actually paired: either a
 * foreign key relates them, or a recorded call named both ends. The count on a
 * line is that PAIR's count and never either end's total. Where no key exists —
 * interface to connection, which the broker resolves per call — an unobserved
 * pairing is not a fact and no line is drawn at all.
 *
 * THE COLUMNS RUN IN THE DIRECTION OF A REQUEST, not of the data: an app calls
 * in on the left and SAP answers on the right. That is the direction this
 * product already names — the public surface is the northbound API — and the
 * band above the columns says so rather than leaving it to be inferred.
 *
 * Solid and coloured = the feed recorded traffic here. Faint and dashed =
 * wired, nothing recorded. Every count is written with a `≥`, because the feed
 * is a floor: a call refused at the throttle leaves no row at all.
 *
 * MOTION MEANS A RECORDED EVENT. Pulses replay ONCE, on load and on demand, one
 * run per window — nothing loops and nothing idles. There is no "alive" pulse
 * because the platform genuinely cannot assert that anything is alive: a blank
 * probe means nobody has asked, and `lastUsedAt` is fire-and-forget. Under
 * `prefers-reduced-motion` the pulses do not run and the counts carry the whole
 * story, which is also what a screenshot gets.
 *
 * Counts and replay appear in the Operations Center only. The other two
 * workspaces read the same graph for a different question — what is built, and
 * who is accountable — and traffic there is context, drawn faint.
 *
 * NO SUMMARY, NO SCORE. The Operations home's argument holds here: a second
 * copy of a number is a thing that disagrees with the screen that owns it. Every
 * node links to its authoritative screen instead, in that workspace's own
 * vocabulary — "Connections" in Studio, "Connection register" in Control Tower.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OPS_WINDOWS } from "@/components/ops/useOpsFeed";
import {
  BANDS,
  COLUMN_LABELS,
  DEFAULT_WINDOW_HOURS,
  EDGE_WEIGHT,
  LAYOUT,
  bandExtent,
  layoutTopology,
  lensShowsTraffic,
  orthoPath,
  pulseCount,
  type EdgeObservation,
  type Lens,
  type NodeState,
  type TopologyEdge,
  type TopologyNode,
} from "@/lib/ops/topology";

interface Payload {
  lens: Lens;
  windowHours: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  collapsed: { column: number; count: number }[];
  provenance: {
    feedIsAFloor: string;
    grantAttribution: string;
    binding: string;
    noSummary: string;
  };
}

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
    /*
     * NOT "NEVER OBSERVED". Every count behind this state comes from a feed
     * bounded to the selected window, so the honest reading is "nothing was
     * recorded in the period being looked at" — which is a different and much
     * weaker statement than "this has never been used".
     */
    label: "Not observed in this window",
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

/** An edge's colour follows what was recorded along it, not either endpoint. */
const EDGE_COLOUR: Record<EdgeObservation, string> = {
  good: "var(--status-signed-fg)",
  mixed: "var(--status-awaiting-fg)",
  bad: "var(--status-revoked-fg)",
  never: "var(--border-strong)",
};

const EDGE_LABEL: Record<EdgeObservation, string> = {
  good: "every recorded call succeeded",
  mixed: "some recorded calls were refused",
  bad: "every recorded call was refused",
  never: "wired; nothing recorded",
};

const { nodeW: NODE_W, nodeH: NODE_H, bandH: BAND_H } = LAYOUT;

export function TopologyMap({ lens }: { lens: Lens }) {
  const [hours, setHours] = useState(DEFAULT_WINDOW_HOURS[lens]);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  /**
   * Bumped to replay. Keying the SVG animations on it is what makes them run
   * again — an `animateMotion` that has already frozen will not restart, so the
   * elements have to be new ones.
   */
  const [replay, setReplay] = useState(0);
  const [reduced, setReduced] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
        if (cancelled) return;
        setData(json.data as Payload);
        // One replay per load and per window change — never a loop.
        setReplay((n) => n + 1);
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

  const nodes = useMemo(() => data?.nodes ?? [], [data]);
  const edges = useMemo(() => data?.edges ?? [], [data]);

  const layout = useMemo(
    () => layoutTopology(nodes, data?.collapsed ?? []),
    [nodes, data?.collapsed],
  );

  const ordered = useMemo(
    () =>
      [...nodes].sort(
        (a, b) =>
          a.column - b.column ||
          (layout.positions.get(a.id)?.y ?? 0) - (layout.positions.get(b.id)?.y ?? 0),
      ),
    [nodes, layout],
  );

  /** Arrow keys walk the graph; Enter opens the authoritative screen. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!ordered.length) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const i = ordered.findIndex((n) => n.id === focused);
      if (i === -1) {
        setFocused(ordered[0]!.id);
        return;
      }
      const next = e.key === "ArrowRight" ? Math.min(i + 1, ordered.length - 1) : Math.max(i - 1, 0);
      setFocused(ordered[next]!.id);
    },
    [ordered, focused],
  );

  const hovered = nodes.find((n) => n.id === focused) ?? null;
  const showsTraffic = lensShowsTraffic(lens);
  const liveEdges = edges.filter((e) => e.calls > 0 && !e.inert);

  if (loading) {
    return (
      <Frame lens={lens} hours={hours} onHours={setHours}>
        <Muted>Loading the topology…</Muted>
      </Frame>
    );
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

  const isEmpty = nodes.every((n) => n.kind === "caller" || n.kind === "tenant");

  return (
    <Frame
      lens={lens}
      hours={hours}
      onHours={setHours}
      {...(isEmpty
        ? {}
        : {
            replayControl: (
              <ReplayButton
                lens={lens}
                reduced={reduced}
                enabled={showsTraffic && !reduced && liveEdges.length > 0}
                onReplay={() => setReplay((n) => n + 1)}
              />
            ),
          })}
    >
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
            style={{ overflowX: "auto", padding: "4px 2px 14px" }}
          >
            <div style={{ position: "relative", width: layout.width, height: layout.height }}>
              <EdgeLayer
                edges={edges}
                layout={layout}
                lens={lens}
                focused={focused}
                replay={replay}
                reduced={reduced}
              />

              {/*
                * THE DIRECTION, WRITTEN DOWN. The columns run in the order a
                * REQUEST travels — app on the left, SAP on the right — which is
                * the opposite of the way the data comes back, and is not
                * self-evident from the ordering alone. "Northbound" is the
                * product's own word for the API an app calls; the SAP side is
                * called what the resolver calls it, binding, rather than
                * inventing a symmetrical term nothing else uses.
                */}
              {BANDS.map((band) => {
                const { x, width } = bandExtent(band, layout);
                return (
                  <div
                    key={band.label}
                    title={band.note}
                    style={{
                      position: "absolute",
                      left: x,
                      top: 0,
                      width,
                      height: BAND_H - 8,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 8px",
                      borderRadius: 5,
                      background: "var(--surface-cream)",
                      border: "1px solid var(--border-default)",
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--ink-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {band.label}
                  </div>
                );
              })}

              {layout.columnX.map((x, col) => (
                <div
                  key={col}
                  style={{
                    position: "absolute",
                    left: x,
                    top: BAND_H,
                    width: NODE_W,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: ".09em",
                    fontWeight: 700,
                    color: "var(--ink-muted)",
                  }}
                >
                  {COLUMN_LABELS[col]}
                </div>
              ))}

              {nodes.map((n) => {
                const p = layout.positions.get(n.id);
                if (!p) return null;
                return (
                  <NodeBox
                    key={n.id}
                    node={n}
                    at={p}
                    active={focused === n.id}
                    onEnter={() => setFocused(n.id)}
                  />
                );
              })}

              {(data?.collapsed ?? []).map((c) => {
                const p = layout.chips.get(c.column);
                if (!p) return null;
                return (
                  // Never a silent truncation — the count is the point.
                  <div
                    key={`chip-${c.column}`}
                    style={{
                      position: "absolute",
                      left: p.x,
                      top: p.y,
                      width: NODE_W,
                      height: NODE_H,
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      border: "1px dashed var(--border-strong)",
                      borderRadius: 8,
                      fontSize: 11,
                      lineHeight: "14px",
                      color: "var(--ink-muted)",
                      background: "var(--surface-cream)",
                      overflow: "hidden",
                    }}
                  >
                    +{c.count} more not shown. Defects and rows that carried traffic are kept
                    first.
                  </div>
                );
              })}
            </div>
          </div>

          {layout.unplaced.length > 0 ? (
            // Surfaced, not swallowed. A node the grid could not take renders
            // as nothing at all, which leaves a canvas that looks complete.
            <p role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--cta-red)" }}>
              {layout.unplaced.length} component(s) could not be placed on the grid and are not
              shown. This view is incomplete — treat it as a defect in the diagram, not in the
              tenant.
            </p>
          ) : null}

          <Provenance
            node={hovered}
            payload={data}
            edges={edges}
            folded={(data?.collapsed ?? []).length > 0}
            liveEdgeCount={liveEdges.length}
            showsTraffic={showsTraffic}
          />
          <Legend showsTraffic={showsTraffic} />
        </>
      )}
    </Frame>
  );
}

/**
 * The lines, in one SVG behind the nodes.
 *
 * Decorative to a screen reader — every fact it draws is also written into the
 * provenance panel below, which is what a keyboard user is actually reading.
 * An SVG full of unlabelled paths announced one by one is noise, not access.
 */
function EdgeLayer({
  edges,
  layout,
  lens,
  focused,
  replay,
  reduced,
}: {
  edges: TopologyEdge[];
  layout: ReturnType<typeof layoutTopology>;
  lens: Lens;
  focused: string | null;
  replay: number;
  reduced: boolean;
}) {
  const weight = EDGE_WEIGHT[lens];
  const showsTraffic = lensShowsTraffic(lens);

  return (
    <svg
      width={layout.width}
      height={layout.height}
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
    >
      {/*
        * ARROWHEADS, BECAUSE A LINE HAS NO DIRECTION.
        *
        * The band above the columns says which way a request travels, but a
        * reader tracing one specific line gets nothing from the band — and the
        * ordering alone was already misread once. An arrowhead is the cheapest
        * honest direction cue: it survives a screenshot, it needs no legend,
        * and unlike motion it asserts nothing about how much traffic there is.
        *
        * One marker per colour: a marker does not inherit its path's stroke,
        * and `context-stroke` is not old enough to rely on here.
        */}
      <defs>
        {(Object.keys(EDGE_COLOUR) as EdgeObservation[]).map((o) => (
          <marker
            key={o}
            id={`ce-arrow-${lens}-${o}`}
            viewBox="0 0 6 6"
            markerWidth={5}
            markerHeight={5}
            refX={5.4}
            refY={3}
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0.6 L 6 3 L 0 5.4 z" fill={EDGE_COLOUR[o]} />
          </marker>
        ))}
      </defs>
      {edges.map((e, i) => {
        const a = layout.positions.get(e.from);
        const b = layout.positions.get(e.to);
        if (!a || !b) return null;

        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const d = orthoPath(x1, y1, x2, y2);
        const colour = EDGE_COLOUR[e.observed];
        const faint = e.observed === "never";

        // A focused node's own wiring comes forward; everything else recedes.
        // Without this, a dense column is a thicket and hovering tells you
        // nothing about what the thing you are hovering is connected to.
        const touched = focused == null || e.from === focused || e.to === focused;
        const opacity =
          (faint ? weight * 0.7 : weight) * (e.inert ? 0.55 : 1) * (touched ? 1 : 0.25);

        const pulses =
          showsTraffic && !reduced && !e.inert && replay > 0 ? pulseCount(e.calls) : 0;
        const mx = Math.round((x1 + x2) / 2);
        const my = (y1 + y2) / 2;

        return (
          <g key={`${e.from}->${e.to}`}>
            <path
              d={d}
              fill="none"
              stroke={colour}
              strokeWidth={1.5}
              strokeDasharray={faint || e.inert ? "3 4" : undefined}
              markerEnd={`url(#ce-arrow-${lens}-${e.observed})`}
              opacity={opacity}
            />
            {showsTraffic && e.calls > 0 ? (
              <text
                x={mx}
                y={my - 5}
                textAnchor="middle"
                fontSize={9}
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
                fill="var(--ink-muted)"
                opacity={touched ? 1 : 0.3}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {/* A floor, never a total. The glyph is the whole caveat. */}
                {`≥${e.calls.toLocaleString()}`}
              </text>
            ) : null}
            {Array.from({ length: pulses }, (_, k) => {
              const begin = (k * 0.38 + (i % 5) * 0.12).toFixed(2);
              return (
                <circle key={`${replay}-${k}`} r={2.8} fill={colour} opacity={0}>
                  <animateMotion dur="1.5s" begin={`${begin}s`} path={d} fill="freeze" repeatCount={1} />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    dur="1.5s"
                    begin={`${begin}s`}
                    fill="freeze"
                    repeatCount={1}
                  />
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function NodeBox({
  node,
  at,
  active,
  onEnter,
}: {
  node: TopologyNode;
  at: { x: number; y: number };
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
        position: "absolute",
        left: at.x,
        top: at.y,
        width: NODE_W,
        height: NODE_H,
        boxSizing: "border-box",
        display: "block",
        padding: "8px 10px",
        borderRadius: 8,
        textDecoration: "none",
        overflow: "hidden",
        background: node.quiet ? "var(--surface-cream)" : s.bg,
        // Endedness is the stroke; state is the glyph. Independent by design.
        border: `1.5px ${ended ? "dashed" : "solid"} ${active ? "var(--brand-navy)" : "var(--border-strong)"}`,
        opacity: ended ? 0.72 : 1,
        color: "var(--ink-primary)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden="true"
          style={{ fontSize: 12, fontWeight: 700, color: node.quiet ? "var(--ink-muted)" : s.fg }}
        >
          {s.glyph}
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.label}
        </span>
      </span>
      {/* The state is spelled out for a screen reader; the glyph is decorative. */}
      <span className="sr-only">
        {s.label}
        {ended ? `, ended (${node.ended?.kind})` : ""}
      </span>
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
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * What the focused node is wired to, in words.
 *
 * THIS IS THE EDGE LAYER'S ACCESSIBLE EQUIVALENT, not a decoration of it. The
 * SVG is hidden from assistive technology, so if a connection is only ever
 * drawn as a line then a keyboard user does not have it. Everything the lines
 * encode — how many pairings, how much was recorded, how much was refused —
 * is written here.
 */
function wiringSentence(node: TopologyNode, edges: TopologyEdge[], folded: boolean): string {
  const out = edges.filter((e) => e.from === node.id);
  const into = edges.filter((e) => e.to === node.id);
  const all = [...out, ...into];
  if (all.length === 0) {
    /*
     * "NOTHING IS WIRED TO THIS" IS A CLAIM, and it is false whenever a column
     * has been folded: the route drops any edge whose other end was collapsed
     * away, so a grant whose solution did not survive the fold arrives here
     * looking unconnected. Saying so would report a configuration problem that
     * does not exist — and this sentence is the only form a keyboard user gets
     * the wiring in, so there is nothing else to correct it.
     */
    return folded
      ? "No lines are shown for this. Some columns are folded, and an edge is dropped when the component at its other end is not on the canvas — so this may be wired to something that is currently hidden."
      : "Nothing is wired to this — no pairing and no recorded call reaches it.";
  }

  const calls = all.reduce((n, e) => n + e.calls, 0);
  const failures = all.reduce((n, e) => n + e.failures, 0);
  const carrying = all.filter((e) => e.calls > 0).length;

  const shape = `Wired to ${into.length} upstream and ${out.length} downstream component(s).`;
  if (calls === 0) {
    return `${shape} No call along any of them was recorded in this window — a floor, not a count of zero.`;
  }
  const refused = failures > 0 ? ` ${failures.toLocaleString()} of those were refused.` : "";
  return `${shape} At least ${calls.toLocaleString()} call(s) recorded across ${carrying} of them.${refused}`;
}

function Provenance({
  node,
  payload,
  edges,
  folded,
  liveEdgeCount,
  showsTraffic,
}: {
  node: TopologyNode | null;
  payload: Payload | null;
  edges: TopologyEdge[];
  /** Any column folded, so an absent line is not proof of an absent link. */
  folded: boolean;
  liveEdgeCount: number;
  showsTraffic: boolean;
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
          <div style={{ marginTop: 4 }}>{wiringSentence(node, edges, folded)}</div>
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
              {node.ended.carried === true
                ? "It carried recorded traffic before it ended."
                : node.ended.carried === null
                  ? "It ended before this window opened, so whether it ever carried traffic cannot be told from here. Widen the window past that date to ask."
                  : "No traffic was recorded under it — which is not the same as none having run."}
            </div>
          ) : null}
        </>
      ) : (
        <>
          Hover or focus a component to see what its state is derived from, what it is wired to,
          and what it will not tell you. The window scopes what counts as OBSERVED — it does not
          change what exists, and structure, ownership and expiry are not windowed.{" "}
          {payload?.provenance.feedIsAFloor}{" "}
          {liveEdgeCount === 0
            ? "No calls were recorded in this window, which is a floor rather than a count of zero."
            : `${liveEdgeCount} connection(s) between components carried recorded calls in this window.`}
          {showsTraffic ? ` ${payload?.provenance.binding ?? ""}` : ""}
        </>
      )}
    </div>
  );
}

/**
 * Replay, and the reason it might not be offered.
 *
 * A DISABLED CONTROL THAT SAYS WHY. In Studio and Control Tower the traffic
 * replay is deliberately absent — those pages are not asking about traffic —
 * and an unexplained missing button reads as a broken one.
 */
function ReplayButton({
  lens,
  reduced,
  enabled,
  onReplay,
}: {
  lens: Lens;
  reduced: boolean;
  enabled: boolean;
  onReplay: () => void;
}) {
  const label = reduced
    ? "Motion off"
    : !lensShowsTraffic(lens)
      ? "Traffic muted"
      : enabled
        ? "Replay window"
        : "Nothing recorded";
  const title = reduced
    ? "Reduced motion is on, so nothing animates. The counts on each line carry the same information."
    : !lensShowsTraffic(lens)
      ? "Traffic replay belongs to the Operations Center. This page reads the same graph for a different question."
      : enabled
        ? "Replay the calls the audit feed recorded in this window, once."
        : "The feed recorded no calls in this window. That is a floor, not a count of zero.";

  return (
    <button
      type="button"
      onClick={onReplay}
      disabled={!enabled}
      title={title}
      style={{
        border: "1px solid var(--border-default)",
        background: "var(--surface-paper)",
        color: enabled ? "var(--ink-secondary)" : "var(--ink-muted)",
        borderRadius: 6,
        padding: "3px 9px",
        fontSize: 11.5,
        fontWeight: 600,
        cursor: enabled ? "pointer" : "default",
        opacity: enabled ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  );
}

function Legend({ showsTraffic }: { showsTraffic: boolean }) {
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
      <li>
        <span aria-hidden="true">▸</span> arrows point the way a request travels, app to SAP
      </li>
      {showsTraffic
        ? (["good", "mixed", "bad", "never"] as EdgeObservation[]).map((o) => (
            <li key={o}>
              <span aria-hidden="true" style={{ color: EDGE_COLOUR[o], fontWeight: 700 }}>
                ──
              </span>{" "}
              {EDGE_LABEL[o]}
            </li>
          ))
        : null}
      <li>≥ on a line: recorded calls, a floor rather than a total.</li>
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
  replayControl,
  children,
}: {
  lens: Lens;
  hours: number;
  onHours: (h: number) => void;
  replayControl?: React.ReactNode;
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
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>What is wired to what</h2>
        <span style={{ fontSize: 12, color: "var(--ink-muted)", flex: 1, minWidth: 200 }}>
          {LENS_CAPTION[lens]}
        </span>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          {/*
            * LABELLED, because it is not a filter on a list — it decides what
            * counts as observed. A node with no recorded call inside it reads
            * ∅, so moving this control changes states, and an unlabelled row of
            * durations gave no hint that it would.
            */}
          <span
            id={`topology-window-${lens}`}
            style={{
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: ".07em",
              fontWeight: 700,
              color: "var(--ink-muted)",
              marginRight: 2,
            }}
          >
            Observed over
          </span>
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
          {replayControl}
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
