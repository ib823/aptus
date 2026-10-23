"use client";

/**
 * The Query policy card (P1.4, 3.15): what callers of one READ interface may
 * select, filter, sort, look up by key and page through on its /data route.
 *
 * ONE OF FIVE STATES, each saying what it means for a caller:
 *   Needs verify  no basis yet (never verified since P1.4, the contract
 *                 changed, or it was only ever sampled): a link to Verify.
 *   Off           no policy: query parameters are refused, QUERY_NOT_AVAILABLE.
 *                 "Enable queries" saves the safe default (studio/query-policy.ts).
 *   Ready         callers are held to the compiled policy shown.
 *   Stale         a verify found a change narrowing cannot absorb; every
 *                 query is refused until a builder reviews and saves it.
 *   Unreadable    a stored policy CoreEdge cannot read; the same as stale.
 * And, whatever the state, a note when this deployment's switch is off.
 *
 * THE FIELD TABLE IS THE CONTRACT'S, NOT THE POLICY'S: one row per property
 * the verify described, so a field the contract gained is offered and one it
 * lost is gone. Unticking Read clears Filter and Sort on the row, as the
 * compiler would (threat T7: a field a caller cannot read is never a filter
 * oracle), and a key part stays readable while key lookup or paging needs it.
 * Every control the contract or SAP rules out is disabled WITH ITS REASON in
 * text beside it, never by colour or a tooltip alone.
 *
 * THE SERVER DECIDES. The card proposes a source; the route compiles it
 * against the basis it was drawn from (409 when either moved), refuses what
 * the contract does not allow with one sentence per problem, and answers a
 * save that narrows an ACTIVE interface with what callers would lose before
 * writing it. The card shows those answers as they come back.
 *
 * Imports from src/lib are TYPES ONLY: the policy modules hash with
 * node:crypto, which has no place in a browser bundle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { StudioStatusChip } from "@/components/studio/StudioStatusChip";
import type { BasisProperty, QueryBasisV1 } from "@/lib/odata/basis";
import type { QueryFilterOp, QueryPolicySourceV1 } from "@/lib/odata/policy";
import type { CompiledSummary } from "@/lib/studio/query-policy";

export interface QueryPolicyView {
  interfaceId: string;
  interfaceStatus: string;
  basis: QueryBasisV1 | null;
  basisHash: string | null;
  source: QueryPolicySourceV1 | null;
  sourceUnreadable: boolean;
  compiled: CompiledSummary | null;
  revision: number;
  flagEnabled: boolean;
  canEdit: boolean;
  suggested: QueryPolicySourceV1 | null;
}

type CardState = "NEEDS_VERIFY" | "OFF" | "READY" | "STALE" | "UNREADABLE";

/** Which state the card is in: the basis first (nothing can be saved without one), then the policy. */
export function queryCardState(view: QueryPolicyView): CardState {
  // Falsy rather than null: an answer missing a field is read as the safe state, never as ready.
  if (!view.basis || view.basis.source !== "METADATA") return "NEEDS_VERIFY";
  if (!view.source && !view.sourceUnreadable) return "OFF";
  if (view.sourceUnreadable || !view.compiled || view.compiled.state === "UNREADABLE") return "UNREADABLE";
  return view.compiled.state === "STALE" ? "STALE" : "READY";
}

const STATE_CHIP = {
  NEEDS_VERIFY: { status: "NEEDS_SETUP", label: "needs verify", meaning: "the service's fields have not been described for queries yet" },
  OFF: { status: "NOT_CHECKED", label: "queries off", meaning: "callers sending query parameters are refused" },
  READY: { status: "ACTIVATED", label: "queries on", meaning: "callers may query within this policy" },
  STALE: { status: "NEEDS_SETUP", label: "stale", meaning: "every query is refused until a builder saves the policy again" },
  UNREADABLE: { status: "NEEDS_SETUP", label: "needs a save", meaning: "every query is refused until a builder saves the policy again" },
} as const;

/* ── the field table's rules, as the compiler applies them ───────────────── */

const LITERAL_TYPES = new Set(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA"]);
const DRAFT_KEY = "IsActiveEntity";
const RANGE_OPS: readonly QueryFilterOp[] = ["gt", "ge", "lt", "le"];
const MAX_REQUIRED = 8;
const BYTE_CAP = { min: 262_144, max: 4_000_000 } as const;

type Chip = "eq" | "in" | "range";
const CHIP_LABEL: Record<Chip, string> = { eq: "=", in: "any of", range: "range" };
const CHIP_MEANING: Record<Chip, string> = { eq: "equals", in: "any of a list", range: "a range (greater or less than)" };

interface Shape {
  readonly props: readonly BasisProperty[];
  readonly addressable: readonly string[];
  readonly keyParts: readonly string[];
  readonly pinned: ReadonlySet<string>;
  readonly keys: ReadonlySet<string>;
  readonly paging: { readonly possible: true } | { readonly possible: false; readonly reason: string };
  readonly keyLookup: { readonly possible: true } | { readonly possible: false; readonly reason: string };
  readonly countable: boolean;
}

function shapeOf(basis: QueryBasisV1): Shape {
  const byName = new Map(basis.properties.map((p) => [p.n, p]));
  const pinned = new Set(basis.odata === "V4" ? basis.keys.filter((k) => k === DRAFT_KEY && byName.get(k)?.t === "B") : []);
  const keyParts = basis.keys.filter((k) => !pinned.has(k));
  const usable = (k: string) => {
    const p = byName.get(k);
    return p !== undefined && p.bad === undefined && LITERAL_TYPES.has(p.t);
  };
  let paging: Shape["paging"] = { possible: true };
  if (basis.set.pageable === false || basis.set.topSupported === false || basis.set.skipSupported === false) {
    paging = { possible: false, reason: "SAP does not support paging on this dataset" };
  } else if (keyParts.length === 0) {
    paging = { possible: false, reason: "the dataset has no key to order pages by" };
  } else if (keyParts.some((k) => !usable(k) || byName.get(k)!.sortable === false || basis.set.sortable === false)) {
    paging = { possible: false, reason: "SAP does not allow ordering by the key" };
  }
  let keyLookup: Shape["keyLookup"] = { possible: true };
  if (basis.set.addressable === false) keyLookup = { possible: false, reason: "SAP does not allow access by key on this dataset" };
  else if (keyParts.length === 0) keyLookup = { possible: false, reason: "the dataset has no key" };
  else if (keyParts.some((k) => !usable(k) || byName.get(k)!.t === "B")) keyLookup = { possible: false, reason: "a key field cannot be addressed" };
  return {
    props: basis.properties,
    addressable: basis.properties.filter((p) => p.bad === undefined).map((p) => p.n),
    keyParts,
    pinned,
    keys: new Set(basis.keys),
    paging,
    keyLookup,
    countable: basis.set.countable !== false,
  };
}

/** Why a field cannot be filtered on, or null when it can (given that it is readable). */
function filterReason(p: BasisProperty, basis: QueryBasisV1, shape: Shape): string | null {
  if (p.bad !== undefined) return "CoreEdge cannot address it";
  if (shape.pinned.has(p.n)) return "pinned to true: drafts are never served";
  if (!LITERAL_TYPES.has(p.t)) return `its type (${p.edm}) cannot be filtered on`;
  if (p.filterable === false || basis.set.filterable === false) return "SAP does not allow filtering on it";
  return null;
}

function sortReason(p: BasisProperty, basis: QueryBasisV1): string | null {
  if (p.bad !== undefined) return "CoreEdge cannot address it";
  if (!LITERAL_TYPES.has(p.t)) return `its type (${p.edm}) cannot be sorted on`;
  if (p.sortable === false || basis.set.sortable === false) return "SAP does not allow sorting on it";
  return null;
}

/* ── the editor's draft ──────────────────────────────────────────────────── */

interface Draft {
  read: Set<string>;
  chips: Map<string, Set<Chip>>;
  sort: Set<string>;
  required: Set<string>;
  keyLookup: boolean;
  count: boolean;
  page: { defaultSize: string; maxSize: string; rowCap: string; byteCapMb: string };
}

function draftOf(source: QueryPolicySourceV1, shape: Shape): Draft {
  const addressable = new Set(shape.addressable);
  const read = new Set(source.select === "*" ? shape.addressable : source.select.filter((n) => addressable.has(n)));
  const chips = new Map<string, Set<Chip>>();
  for (const f of source.filter) {
    if (!read.has(f.field)) continue;
    const set = new Set<Chip>();
    if (f.ops.includes("eq")) set.add("eq");
    if (f.ops.includes("in")) set.add("in");
    if (f.ops.some((op) => RANGE_OPS.includes(op))) set.add("range");
    chips.set(f.field, set);
  }
  return {
    read,
    chips,
    sort: new Set(source.sort.filter((n) => read.has(n))),
    required: new Set(source.requireFilterOn),
    keyLookup: source.keyLookup,
    count: source.count,
    page: {
      defaultSize: String(source.page.defaultSize),
      maxSize: String(source.page.maxSize),
      rowCap: String(source.page.rowCap),
      byteCapMb: String(source.page.byteCap / 1_000_000),
    },
  };
}

/** The draft as the source the route compiles. Every field readable is "*", so fields the contract gains later are readable too. */
function sourceOf(draft: Draft, shape: Shape): QueryPolicySourceV1 {
  const order = shape.props.map((p) => p.n);
  const allRead = shape.addressable.every((n) => draft.read.has(n));
  const filter: { field: string; ops: QueryFilterOp[] }[] = [];
  for (const n of order) {
    const chips = draft.chips.get(n);
    if (!draft.read.has(n) || !chips || chips.size === 0) continue;
    const ops: QueryFilterOp[] = [];
    if (chips.has("eq") || chips.has("in")) ops.push("eq");
    if (chips.has("in")) ops.push("in");
    if (chips.has("range")) ops.push(...RANGE_OPS);
    filter.push({ field: n, ops });
  }
  const sapRequired = new Set(shape.props.filter((p) => p.requiredInFilter === true).map((p) => p.n));
  const mb = Number.parseFloat(draft.page.byteCapMb);
  return {
    v: 1,
    select: allRead ? "*" : order.filter((n) => draft.read.has(n)),
    filter,
    sort: order.filter((n) => draft.read.has(n) && draft.sort.has(n)),
    // SAP's own required fields are added by the compiler; the source lists only the builder's.
    requireFilterOn: order.filter((n) => draft.required.has(n) && !sapRequired.has(n)),
    keyLookup: draft.keyLookup,
    count: draft.count,
    page: {
      defaultSize: Number.parseInt(draft.page.defaultSize, 10),
      maxSize: Number.parseInt(draft.page.maxSize, 10),
      rowCap: Number.parseInt(draft.page.rowCap, 10),
      byteCap: Number.isFinite(mb) ? Math.min(BYTE_CAP.max, Math.max(BYTE_CAP.min, Math.round(mb * 1_000_000))) : BYTE_CAP.max,
    },
  };
}

/* ── the card ────────────────────────────────────────────────────────────── */

interface SaveProblem {
  message: string;
  errors: { field?: string; rule: string; message: string }[];
  conflict: boolean;
}

export function QueryPolicyCard({ interfaceId, canAuthor }: { interfaceId: string; canAuthor: boolean }) {
  const [view, setView] = useState<QueryPolicyView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [confirm, setConfirm] = useState<{ narrowed: string[]; message: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/studio/interfaces/${encodeURIComponent(interfaceId)}/query-policy`, { cache: "no-store" });
      const json = (await res.json()) as { data?: QueryPolicyView; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "The query policy could not be loaded.");
      setView(json.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "The query policy could not be loaded.");
    }
  }, [interfaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shape = useMemo(() => (view?.basis ? shapeOf(view.basis) : null), [view]);
  const editable = canAuthor && view?.canEdit === true;

  const put = useCallback(
    async (source: QueryPolicySourceV1, confirmNarrowing: boolean) => {
      if (!view) return;
      setBusy(true);
      setProblem(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/studio/interfaces/${encodeURIComponent(interfaceId)}/query-policy`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            expected: { revision: view.revision, basisHash: view.basisHash },
            ...(confirmNarrowing ? { confirmNarrowing: true } : {}),
          }),
        });
        const json = (await res.json()) as {
          data?: { saved: boolean; revision?: number; widened?: string[]; narrowed?: string[]; confirm?: { narrowed: string[]; message: string } };
          error?: { message?: string; errors?: SaveProblem["errors"] };
        };
        if (!res.ok || !json.data) {
          setProblem({ message: json.error?.message ?? "The query policy could not be saved.", errors: json.error?.errors ?? [], conflict: res.status === 409 });
          return false;
        }
        if (!json.data.saved && json.data.confirm) {
          setConfirm(json.data.confirm);
          return false;
        }
        setConfirm(null);
        setEditing(null);
        const parts = [`Saved as revision ${json.data.revision}.`];
        if (json.data.widened && json.data.widened.length > 0) parts.push(`Widened: ${json.data.widened.join(", ")}.`);
        if (json.data.narrowed && json.data.narrowed.length > 0) parts.push(`Narrowed: ${json.data.narrowed.join(", ")}.`);
        setNotice(parts.join(" "));
        await load();
        return true;
      } catch {
        setProblem({ message: "The query policy could not be saved. Try again.", errors: [], conflict: false });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [interfaceId, load, view],
  );

  const remove = useCallback(async () => {
    if (!view) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/studio/interfaces/${encodeURIComponent(interfaceId)}/query-policy`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected: { revision: view.revision } }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setProblem({ message: json.error?.message ?? "The query policy could not be removed.", errors: [], conflict: res.status === 409 });
        return;
      }
      setConfirmRemove(false);
      setEditing(null);
      setNotice("Queries are off: callers sending query parameters now receive 400 QUERY_NOT_AVAILABLE.");
      await load();
    } finally {
      setBusy(false);
    }
  }, [interfaceId, load, view]);

  // The state beside the heading, in words (the chip's label), not inside it.
  const heading = (
    <div style={{ margin: "0 0 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <h3 id={`query-policy-${interfaceId}`} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
        Query policy
      </h3>
      {view && <StudioStatusChip {...STATE_CHIP[queryCardState(view)]} />}
    </div>
  );

  if (loadError) {
    return (
      <section style={card} aria-labelledby={`query-policy-${interfaceId}`}>
        {heading}
        <p role="alert" style={{ ...text, color: "var(--status-revoked-fg)" }}>
          {loadError}
        </p>
        <button type="button" style={btnSmall} onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  }
  if (!view) {
    return (
      <section style={card} aria-labelledby={`query-policy-${interfaceId}`} aria-busy="true">
        {heading}
        <p style={muted}>Loading the query policy…</p>
      </section>
    );
  }

  const state = queryCardState(view);
  const startEditing = (source: QueryPolicySourceV1 | null) => {
    if (!shape) return;
    setProblem(null);
    setConfirm(null);
    setNotice(null);
    const from = source ?? view.suggested ?? view.source;
    if (from) setEditing(draftOf(from, shape));
  };

  return (
    <section style={card} aria-labelledby={`query-policy-${interfaceId}`}>
      {heading}

      {!view.flagEnabled && (
        <p style={{ ...note, marginBottom: 12 }}>
          This deployment does not serve queries yet (<code style={code}>COREEDGE_QUERY_SURFACE</code>): callers sending query
          parameters receive 400 QUERY_NOT_AVAILABLE whatever this policy says. You can prepare the policy now.
        </p>
      )}

      <div aria-live="polite">
        {notice && <p style={{ ...text, marginBottom: 12 }}>{notice}</p>}
        {problem && (
          <div role="alert" style={{ ...banner, marginBottom: 12 }}>
            <p style={{ ...text, margin: 0 }}>{problem.message}</p>
            {problem.errors.length > 1 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, ...text }}>
                {problem.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            )}
            {problem.conflict && (
              <button
                type="button"
                style={{ ...btnSmall, marginTop: 8 }}
                onClick={() => {
                  setProblem(null);
                  setEditing(null);
                  void load();
                }}
              >
                Reload
              </button>
            )}
          </div>
        )}
      </div>

      {state === "NEEDS_VERIFY" && (
        <p style={text}>
          {view.basis && view.basis.source !== "METADATA"
            ? "This contract was inferred from sampled rows, not read from the service's description. "
            : ""}
          Verify the service to describe its fields before offering queries.{" "}
          <a href="#service-verify" style={link}>
            Go to Verify
          </a>
          {view.source ? " The saved policy is kept and is compiled again by the next verify." : null}
        </p>
      )}

      {state === "OFF" && editing === null && (
        <>
          <p style={text}>
            Queries are off. Callers can read this interface with <code style={code}>?limit</code> only; a call carrying
            query parameters (select, filter, orderby, key, count, pageSize, cursor) receives 400 QUERY_NOT_AVAILABLE.
          </p>
          {editable && (
            <div style={actions}>
              <button
                type="button"
                style={btnPrimary}
                disabled={busy || view.suggested === null}
                onClick={() => {
                  if (view.suggested) {
                    void put(view.suggested, false).then((saved) => {
                      // A default the contract refuses (SAP requires a filter CoreEdge cannot
                      // write) opens the editor on it, with the reasons above.
                      if (!saved && shape && view.suggested) setEditing(draftOf(view.suggested, shape));
                    });
                  }
                }}
              >
                Enable queries
              </button>
              <button type="button" style={btnSmall} disabled={busy} onClick={() => startEditing(view.suggested)}>
                Choose fields first
              </button>
            </div>
          )}
          {editable && (
            <p style={{ ...muted, marginTop: 8 }}>
              Enable queries allows every field the ?limit read returns, key lookup, = and any-of filters on the key and on
              fields SAP requires, sorting by the key, no total count, and pages of 100 (at most 500, 10,000 rows per paging
              run).
            </p>
          )}
        </>
      )}

      {(state === "STALE" || state === "UNREADABLE") && (
        <div style={{ ...banner, marginBottom: 12 }}>
          <p style={{ ...text, margin: 0 }}>
            <strong>Every query is refused until this policy is saved again.</strong>{" "}
            {state === "STALE"
              ? (view.compiled?.stale?.sentence ?? "The contract changed since the policy was saved.")
              : "The stored policy could not be read."}
          </p>
          {editable && editing === null && (
            <button type="button" style={{ ...btnSmall, marginTop: 8 }} disabled={busy} onClick={() => startEditing(view.source)}>
              Review and save
            </button>
          )}
        </div>
      )}

      {view.compiled && view.compiled.state !== "UNREADABLE" && state !== "NEEDS_VERIFY" && (
        <p style={{ ...muted, marginBottom: 8 }}>{provenance(view.compiled)}</p>
      )}

      {state === "READY" && view.compiled && editing === null && (
        <>
          <EffectivePolicy compiled={view.compiled} />
          {editable && (
            <div style={{ ...actions, marginTop: 12 }}>
              <button type="button" style={btnPrimary} disabled={busy} onClick={() => startEditing(view.source)}>
                Edit
              </button>
              <button type="button" style={btnSmall} disabled={busy} onClick={() => setConfirmRemove(true)}>
                Remove
              </button>
            </div>
          )}
        </>
      )}

      {confirmRemove && (
        <div role="alert" style={{ ...banner, marginTop: 12 }}>
          <p style={{ ...text, margin: 0 }}>
            Remove the query policy? Every query call to this interface then receives 400 QUERY_NOT_AVAILABLE, and open paging
            runs stop. Reads with ?limit are not affected.
          </p>
          <div style={{ ...actions, marginTop: 8 }}>
            <button type="button" style={btnDanger} disabled={busy} onClick={() => void remove()}>
              Remove the policy
            </button>
            <button type="button" style={btnSmall} disabled={busy} onClick={() => setConfirmRemove(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {editing !== null && view.basis && shape && (
        <PolicyEditor
          interfaceId={interfaceId}
          basis={view.basis}
          shape={shape}
          draft={editing}
          onChange={setEditing}
          busy={busy}
          onCancel={() => {
            setEditing(null);
            setConfirm(null);
            setProblem(null);
          }}
          onSave={() => void put(sourceOf(editing, shape), false)}
          confirm={confirm}
          onConfirm={() => void put(sourceOf(editing, shape), true)}
          onKeepEditing={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

/** "Compiled against contract 2.1.0 (sha ab12…) on 30 Oct 2026 · revision 4 · qp1:…" */
function provenance(c: CompiledSummary): string {
  let head = c.snapshot ? `Compiled against contract ${c.snapshot.semver} (sha ${c.snapshot.contentHash.slice(0, 4)}…)` : "Compiled";
  const at = c.compiledAt ? new Date(c.compiledAt) : null;
  if (at && !Number.isNaN(at.getTime())) {
    head += ` on ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  }
  return [head, c.revision === null ? null : `revision ${c.revision}`, c.rev].filter((part): part is string => part !== null).join(" · ");
}

const OP_TEXT: Record<QueryFilterOp, string> = { eq: "=", in: "any of", gt: ">", ge: "≥", lt: "<", le: "≤" };

/** What callers are held to now: the compiled policy, which a verify may have narrowed since the save. */
function EffectivePolicy({ compiled }: { compiled: CompiledSummary }) {
  const filterable = compiled.fields.filter((f) => f.ops.length > 0);
  const sortable = compiled.fields.filter((f) => f.sort);
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "150px 1fr", gap: "4px 12px", fontSize: 13 }}>
      <dt style={dt}>Readable</dt>
      <dd style={dd}>
        {compiled.fields.length} field{compiled.fields.length === 1 ? "" : "s"}
      </dd>
      <dt style={dt}>Filters</dt>
      <dd style={dd}>
        {filterable.length === 0
          ? "none"
          : filterable.map((f) => `${f.n} (${f.ops.map((op) => OP_TEXT[op]).join(" ")})`).join(", ")}
      </dd>
      <dt style={dt}>Sort</dt>
      <dd style={dd}>{sortable.length === 0 ? "none" : sortable.map((f) => f.n).join(", ")}</dd>
      <dt style={dt}>Key lookup</dt>
      <dd style={dd}>{compiled.key ? `on: key.${compiled.key.join(", key.")}` : "off"}</dd>
      {compiled.pinned.length > 0 && (
        <>
          <dt style={dt}>Drafts</dt>
          <dd style={dd}>never served ({compiled.pinned.join(", ")} pinned to true)</dd>
        </>
      )}
      <dt style={dt}>Total count</dt>
      <dd style={dd}>{compiled.count ? "on" : "off"}</dd>
      <dt style={dt}>Required filters</dt>
      <dd style={dd}>{compiled.requireFilterOn.length === 0 ? "none" : compiled.requireFilterOn.join(", ")}</dd>
      <dt style={dt}>Paging</dt>
      <dd style={dd}>
        {compiled.paging === "OFFSET" ? `Offset, tie-break ${compiled.tieBreak.join(", ")}` : "SAP does not support paging on this dataset"}
        {compiled.page &&
          ` · pages of ${compiled.page.defaultSize} (at most ${compiled.page.maxSize}), ${compiled.page.rowCap.toLocaleString("en-GB")} rows per paging run, ${(compiled.page.byteCap / 1_000_000).toLocaleString("en-GB")} MB per page`}
      </dd>
      {compiled.warnings.length > 0 && (
        <>
          <dt style={dt}>Notes</dt>
          <dd style={dd}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {compiled.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </dd>
        </>
      )}
    </dl>
  );
}

/* ── the editor ──────────────────────────────────────────────────────────── */

function PolicyEditor({
  interfaceId,
  basis,
  shape,
  draft,
  onChange,
  busy,
  onCancel,
  onSave,
  confirm,
  onConfirm,
  onKeepEditing,
}: {
  interfaceId: string;
  basis: QueryBasisV1;
  shape: Shape;
  draft: Draft;
  onChange: (next: Draft) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
  confirm: { narrowed: string[]; message: string } | null;
  onConfirm: () => void;
  onKeepEditing: () => void;
}) {
  const keyLocked = (n: string) => shape.keys.has(n) && !shape.pinned.has(n) && (draft.keyLookup || shape.paging.possible);
  const update = (change: (d: Draft) => void) => {
    const next: Draft = {
      read: new Set(draft.read),
      chips: new Map([...draft.chips].map(([k, v]) => [k, new Set(v)])),
      sort: new Set(draft.sort),
      required: new Set(draft.required),
      keyLookup: draft.keyLookup,
      count: draft.count,
      page: { ...draft.page },
    };
    change(next);
    onChange(next);
  };
  const setRead = (n: string, on: boolean) =>
    update((d) => {
      if (on) d.read.add(n);
      else {
        // A field a caller cannot read is never filtered or sorted on (T7).
        d.read.delete(n);
        d.chips.delete(n);
        d.sort.delete(n);
        d.required.delete(n);
      }
    });
  const toggleChip = (n: string, chip: Chip) =>
    update((d) => {
      const set = d.chips.get(n) ?? new Set<Chip>();
      if (set.has(chip)) {
        set.delete(chip);
        // "any of" is a list of "="; without "=" it goes too.
        if (chip === "eq") set.delete("in");
      } else {
        set.add(chip);
        if (chip === "in") set.add("eq");
      }
      d.chips.set(n, set);
      if (!requirable(d, n)) d.required.delete(n);
    });
  const requirable = (d: Draft, n: string) => {
    const chips = d.chips.get(n);
    return d.read.has(n) && chips !== undefined && chips.size > 0;
  };
  const sapRequired = shape.props.filter((p) => p.requiredInFilter === true).map((p) => p.n);
  const builderRequired = [...draft.required].filter((n) => !sapRequired.includes(n));
  const allRead = shape.addressable.every((n) => draft.read.has(n));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      aria-label="Edit the query policy"
      style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <caption style={{ textAlign: "left", ...muted, paddingBottom: 6 }}>
            Fields of {basis.entitySet} in the current contract: what a caller may read, filter and sort on.{" "}
            {allRead
              ? "Every field is readable, so fields the contract gains later are readable too."
              : "Only the ticked fields are readable."}
          </caption>
          <thead>
            <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
              <th scope="col" style={th}>Field</th>
              <th scope="col" style={th}>Type</th>
              <th scope="col" style={th}>Read</th>
              <th scope="col" style={th}>Filter</th>
              <th scope="col" style={th}>Sort</th>
            </tr>
          </thead>
          <tbody>
            {shape.props.map((p) => {
              const badges = [
                shape.keys.has(p.n) && !shape.pinned.has(p.n) ? "key" : null,
                shape.pinned.has(p.n) ? "draft key (pinned)" : null,
                p.requiredInFilter ? "required by SAP" : null,
                p.filterable === false ? "SAP: not filterable" : null,
                p.sortable === false ? "SAP: not sortable" : null,
              ].filter((b): b is string => b !== null);
              const name = (
                <th scope="row" style={{ ...td, fontWeight: 600, fontFamily: "var(--font-mono, ui-monospace), monospace" }}>
                  {p.n}
                  {p.label && <span style={{ ...muted, display: "block", fontFamily: "inherit", fontWeight: 400 }}>{p.label}</span>}
                  {badges.length > 0 && (
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                      {badges.map((b) => (
                        <span key={b} style={badge}>
                          {b}
                        </span>
                      ))}
                    </span>
                  )}
                </th>
              );
              const type = (
                <td style={td}>
                  {p.edm}
                  {p.ml !== undefined && <span style={muted}> ({p.ml})</span>}
                </td>
              );
              if (p.bad !== undefined) {
                return (
                  <tr key={p.n} style={rowStyle}>
                    {name}
                    {type}
                    <td style={td} colSpan={3}>
                      <span style={reason}>CoreEdge cannot address a field with this name or type.</span>
                    </td>
                  </tr>
                );
              }
              const readable = draft.read.has(p.n);
              const locked = keyLocked(p.n);
              const fReason = filterReason(p, basis, shape) ?? (readable ? null : "make it readable first");
              const sReason = sortReason(p, basis) ?? (readable ? null : "make it readable first");
              const chips = draft.chips.get(p.n) ?? new Set<Chip>();
              const offered: Chip[] = p.t === "B" ? ["eq"] : ["eq", "in", "range"];
              return (
                <tr key={p.n} style={rowStyle}>
                  {name}
                  {type}
                  <td style={td}>
                    <input
                      type="checkbox"
                      aria-label={`Read ${p.n}`}
                      checked={readable}
                      disabled={busy || locked}
                      onChange={(e) => setRead(p.n, e.target.checked)}
                    />
                    {locked && <span style={{ ...reason, display: "block" }}>kept: key lookup and paging need it</span>}
                  </td>
                  <td style={td}>
                    {fReason !== null ? (
                      <span style={reason}>Not filterable: {fReason}</span>
                    ) : (
                      <span role="group" aria-label={`Filters on ${p.n}`} style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {offered.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            aria-pressed={chips.has(chip)}
                            aria-label={`Filter ${p.n}: ${CHIP_MEANING[chip]}`}
                            disabled={busy}
                            onClick={() => toggleChip(p.n, chip)}
                            style={chips.has(chip) ? chipOn : chipOff}
                          >
                            {chips.has(chip) ? "✓ " : ""}
                            {CHIP_LABEL[chip]}
                          </button>
                        ))}
                        {p.t === "B" && <span style={reason}>true or false: = only</span>}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {sReason !== null ? (
                      <span style={reason}>Not sortable: {sReason}</span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Sort by ${p.n}`}
                        checked={draft.sort.has(p.n)}
                        disabled={busy}
                        onChange={(e) =>
                          update((d) => {
                            if (e.target.checked) d.sort.add(p.n);
                            else d.sort.delete(p.n);
                          })
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <fieldset style={fieldset}>
        <legend style={legend}>Lookups</legend>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={draft.keyLookup && shape.keyLookup.possible}
            disabled={busy || !shape.keyLookup.possible}
            onChange={(e) => {
              const on = e.target.checked;
              update((d) => {
                d.keyLookup = on;
              });
            }}
          />
          Key lookup ({shape.keyParts.map((k) => `key.${k}`).join(", ") || "no key"})
        </label>
        {!shape.keyLookup.possible && <span style={reason}>Not available: {shape.keyLookup.reason}.</span>}
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={draft.count && shape.countable}
            disabled={busy || !shape.countable}
            onChange={(e) => {
              const on = e.target.checked;
              update((d) => {
                d.count = on;
              });
            }}
          />
          Total count (count=true on the first page)
        </label>
        {shape.countable ? (
          <span style={muted}>SAP counts with a scan on many datasets; turning it on is recorded as a widening.</span>
        ) : (
          <span style={reason}>Not available: SAP does not count this dataset.</span>
        )}
      </fieldset>

      <fieldset style={fieldset}>
        <legend style={legend}>Paging</legend>
        <p style={{ ...text, margin: "0 0 8px" }}>
          {shape.paging.possible ? `Offset, tie-break ${shape.keyParts.join(", ")}.` : `No paging: ${shape.paging.reason}. Each query answers one page.`}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <NumberField id={`qp-default-${interfaceId}`} label="Default page size" value={draft.page.defaultSize} min={1} max={1000} step={1} busy={busy} onChange={(v) => update((d) => { d.page.defaultSize = v; })} />
          <NumberField id={`qp-max-${interfaceId}`} label="Maximum page size" value={draft.page.maxSize} min={1} max={1000} step={1} busy={busy} onChange={(v) => update((d) => { d.page.maxSize = v; })} />
          <NumberField id={`qp-rowcap-${interfaceId}`} label="Rows per paging run" value={draft.page.rowCap} min={1} max={100_000} step={1} busy={busy} onChange={(v) => update((d) => { d.page.rowCap = v; })} />
          <NumberField id={`qp-bytes-${interfaceId}`} label="Page size limit (MB)" value={draft.page.byteCapMb} min={0.27} max={4} step={0.01} busy={busy} onChange={(v) => update((d) => { d.page.byteCapMb = v; })} />
        </div>
        <span style={muted}>A maximum above 500 or a run above 10,000 rows is recorded as a widening.</span>
      </fieldset>

      <fieldset style={fieldset}>
        <legend style={legend}>Required filters</legend>
        <p style={{ ...muted, margin: "0 0 6px" }}>
          A list query must filter on these with =, any of, or a range with both ends. At most {MAX_REQUIRED} of your own.
        </p>
        {shape.props.filter((p) => p.bad === undefined && (p.requiredInFilter || requirable(draft, p.n))).length === 0 && (
          <span style={muted}>Allow a filter on a field to require it.</span>
        )}
        {shape.props
          .filter((p) => p.bad === undefined && (p.requiredInFilter || requirable(draft, p.n)))
          .map((p) => {
            const bySap = p.requiredInFilter === true;
            const full = !draft.required.has(p.n) && builderRequired.length >= MAX_REQUIRED;
            return (
              <label key={p.n} style={checkRow}>
                <input
                  type="checkbox"
                  checked={bySap || draft.required.has(p.n)}
                  disabled={busy || bySap || full}
                  onChange={(e) =>
                    update((d) => {
                      if (e.target.checked) d.required.add(p.n);
                      else d.required.delete(p.n);
                    })
                  }
                />
                <span style={{ fontFamily: "var(--font-mono, ui-monospace), monospace" }}>{p.n}</span>
                {bySap && <span style={reason}>required by SAP</span>}
              </label>
            );
          })}
      </fieldset>

      {confirm ? (
        <div role="alert" style={banner}>
          <p style={{ ...text, margin: 0 }}>
            This interface is ACTIVE, and this save takes away: <strong>{confirm.narrowed.join(", ")}</strong>. {confirm.message}
          </p>
          <div style={{ ...actions, marginTop: 8 }}>
            <button type="button" style={btnDanger} disabled={busy} onClick={onConfirm}>
              Save anyway
            </button>
            <button type="button" style={btnSmall} disabled={busy} onClick={onKeepEditing}>
              Keep editing
            </button>
          </div>
        </div>
      ) : (
        <div style={actions}>
          <button type="submit" style={btnPrimary} disabled={busy}>
            {busy ? "Saving…" : "Save the policy"}
          </button>
          <button type="button" style={btnSmall} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  busy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  busy: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
        {label}
      </label>
      <input id={id} type="number" inputMode="decimal" value={value} min={min} max={max} step={step} disabled={busy} onChange={(e) => onChange(e.target.value)} style={numberInput} />
    </span>
  );
}

/* ── presentation (InterfacesClient's tokens) ────────────────────────────── */

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 20,
};
const text: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-primary)" };
const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };
const note: React.CSSProperties = { ...text, color: "var(--ink-secondary)" };
/** A reason a control is unavailable: read, so at secondary ink, never muted to near-invisible. */
const reason: React.CSSProperties = { fontSize: 11.5, lineHeight: "16px", color: "var(--ink-secondary)" };
const code: React.CSSProperties = { background: "var(--surface-ink-tint)", borderRadius: 4, padding: "1px 5px", fontSize: 12 };
const link: React.CSSProperties = { color: "var(--brand-navy)", fontWeight: 600, textDecoration: "underline" };
const banner: React.CSSProperties = {
  background: "var(--status-awaiting-bg)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-input, 8px)",
  padding: "10px 12px",
  color: "var(--ink-primary)",
};
const actions: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const dt: React.CSSProperties = { color: "var(--ink-muted)" };
const dd: React.CSSProperties = { margin: 0, color: "var(--ink-primary)" };
const th: React.CSSProperties = { padding: "7px 10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-secondary)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 10px", verticalAlign: "top", color: "var(--ink-primary)", textAlign: "left" };
const rowStyle: React.CSSProperties = { borderTop: "1px solid var(--border-default)" };
const badge: React.CSSProperties = {
  fontSize: 10.5,
  lineHeight: "14px",
  padding: "1px 6px",
  borderRadius: 9999,
  border: "1px solid var(--border-strong)",
  color: "var(--ink-secondary)",
  fontFamily: "var(--font-sans, inherit)",
  fontWeight: 500,
};
const chipBase: React.CSSProperties = { height: 24, padding: "0 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600 };
const chipOff: React.CSSProperties = { ...chipBase, background: "var(--surface-paper)", color: "var(--ink-primary)", border: "1px solid var(--border-strong)" };
/** On is carried by the tick and aria-pressed as well as the fill. */
const chipOn: React.CSSProperties = { ...chipBase, background: "var(--brand-navy)", color: "var(--surface-paper)", border: "1px solid var(--brand-navy)" };
const fieldset: React.CSSProperties = { border: "1px solid var(--border-default)", borderRadius: "var(--radius-input, 8px)", padding: "10px 12px", margin: 0, display: "flex", flexDirection: "column", gap: 6 };
const legend: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--ink-primary)", padding: "0 4px" };
const checkRow: React.CSSProperties = { display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink-primary)" };
const numberInput: React.CSSProperties = {
  height: 28,
  width: 120,
  padding: "0 8px",
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 12.5,
};
const btnPrimary: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--brand-navy)",
  color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)",
  fontSize: 13,
  fontWeight: 600,
};
const btnSmall: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  border: "1px solid var(--border-strong)",
  fontSize: 13,
  fontWeight: 600,
};
const btnDanger: React.CSSProperties = { ...btnSmall, color: "var(--status-revoked-fg)", border: "1px solid var(--status-revoked-fg)" };
