"use client";

/**
 * Consultant question editor (Screen 2.5 — v2 §4).
 *
 * Lists every in-bundle question grouped by sub-process. Per row the
 * consultant can:
 *   - preview the question as the client will see it
 *   - edit plain-language wording inline
 *   - set the response FORMAT (Decision / Information)
 *   - enable / disable (kept in record; never deleted for SAP rows)
 *   - reorder within sub-process (up / down by 10 in displayOrder)
 *   - add a custom question (visibly marked "consultant-added")
 *   - edit aboutText (What this is about:) + standardMeans (What
 *     "Adopt SAP standard" means here) — both seed from the SAP
 *     Topic Definition and may start empty.
 *
 * The SAP verbatim text is locked: never editable, only collapsible.
 * SAP questions (isCustom=false) are never deletable — disable only.
 * The 15 SAP-excluded rows arrive pre-disabled.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EditorRow } from "@/lib/affirm/editor";
import type { ProcessFlow } from "@/lib/affirm/process-flow";
import { ProcessFlowStrip } from "@/components/affirm/ProcessFlowStrip";

interface Props {
  bundleId: string;
  bundleState: string;
  rows: EditorRow[];
  /** v2.1 §9: scope-item id → process flow. */
  flows?: Record<string, ProcessFlow>;
  /** v2.1 §9: scope-item id → description for the strip eyebrow. */
  scopeDescriptions?: Record<string, string>;
}

interface DraftFor {
  consultantWording: string;
  aboutText: string;
  standardMeans: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

export function QuestionEditor({
  bundleId,
  bundleState,
  rows: initialRows,
  flows = {},
  scopeDescriptions = {},
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<EditorRow[]>(initialRows);
  const [drafts, setDrafts] = useState<Record<string, DraftFor>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [adding, setAdding] = useState<{
    wording: string;
    aboutText: string;
    standardMeans: string;
    format: "decision" | "information";
  }>({ wording: "", aboutText: "", standardMeans: "", format: "decision" });
  const [busy, setBusy] = useState<string | null>(null);
  const [issuing, startIssuing] = useTransition();
  const [issueError, setIssueError] = useState<string | null>(null);

  function draftFor(r: EditorRow): DraftFor {
    return (
      drafts[r.questionId] ?? {
        consultantWording: r.consultantWording ?? r.plainLanguageSuggested ?? "",
        aboutText: r.aboutText ?? "",
        standardMeans: r.standardMeans ?? "",
        dirty: false,
        saving: false,
        error: null,
      }
    );
  }

  function setField<K extends "consultantWording" | "aboutText" | "standardMeans">(
    qid: string,
    field: K,
    value: string,
  ) {
    setDrafts((m) => {
      const cur = m[qid] ?? draftFor(rows.find((r) => r.questionId === qid)!);
      return { ...m, [qid]: { ...cur, [field]: value, dirty: true } };
    });
  }

  async function patch(
    qid: string,
    body: Record<string, unknown>,
    opts: { localSet?: (row: EditorRow) => EditorRow } = {},
  ): Promise<boolean> {
    setBusy(qid);
    try {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/questions/${qid}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }
      if (opts.localSet) {
        setRows((rs) =>
          rs.map((r) => (r.questionId === qid ? opts.localSet!(r) : r)),
        );
      }
      return true;
    } catch (e) {
      setDrafts((m) => ({
        ...m,
        [qid]: { ...draftFor(rows.find((r) => r.questionId === qid)!), error: e instanceof Error ? e.message : "save failed" },
      }));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft(qid: string) {
    const d = drafts[qid];
    if (!d || !d.dirty) return;
    const ok = await patch(qid, {
      consultantWording: d.consultantWording.trim() || null,
      aboutText: d.aboutText.trim() || null,
      standardMeans: d.standardMeans.trim() || null,
    });
    if (ok) {
      setRows((rs) =>
        rs.map((r) =>
          r.questionId === qid
            ? {
                ...r,
                consultantWording: d.consultantWording.trim() || null,
                aboutText: d.aboutText.trim() || null,
                standardMeans: d.standardMeans.trim() || null,
              }
            : r,
        ),
      );
      setDrafts((m) => ({ ...m, [qid]: { ...d, dirty: false, saving: false, error: null } }));
    }
  }

  async function toggleEnabled(r: EditorRow) {
    await patch(r.questionId, { enabled: !r.enabled }, {
      localSet: (row) => ({ ...row, enabled: !row.enabled }),
    });
  }

  async function setFormat(r: EditorRow, format: "decision" | "information") {
    if (r.format === format) return;
    await patch(r.questionId, { format }, {
      localSet: (row) => ({ ...row, format }),
    });
  }

  async function move(r: EditorRow, dir: "up" | "down") {
    const peers = rows
      .filter((x) => x.subProcessId === r.subProcessId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = peers.findIndex((x) => x.questionId === r.questionId);
    const swapWith = dir === "up" ? peers[idx - 1] : peers[idx + 1];
    if (!swapWith) return;

    const aOrder = r.displayOrder;
    const bOrder = swapWith.displayOrder;
    // Two PUTs — server is idempotent on join-row update.
    await patch(r.questionId, { displayOrder: bOrder }, {
      localSet: (row) => ({ ...row, displayOrder: bOrder }),
    });
    await patch(swapWith.questionId, { displayOrder: aOrder }, {
      localSet: (row) => ({ ...row, displayOrder: aOrder }),
    });
  }

  async function deleteCustom(r: EditorRow) {
    if (!r.isCustom) return;
    if (
      !window.confirm(
        `Delete custom question ${r.questionId}? SAP questions cannot be deleted — only disabled.`,
      )
    )
      return;
    setBusy(r.questionId);
    try {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/questions/${r.questionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setRows((rs) => rs.filter((x) => x.questionId !== r.questionId));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function addCustom(subProcessId: string) {
    if (!adding.wording.trim()) return;
    setBusy(`add-${subProcessId}`);
    try {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subProcessId,
          wording: adding.wording.trim(),
          format: adding.format,
          aboutText: adding.aboutText.trim() || null,
          standardMeans: adding.standardMeans.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      router.refresh();
      setAdding({ wording: "", aboutText: "", standardMeans: "", format: "decision" });
      setAddingFor(null);
    } finally {
      setBusy(null);
    }
  }

  async function issue() {
    setIssueError(null);
    startIssuing(async () => {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/issue`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // 409 illegal_transition typically means the bundle is already
        // issued (or beyond). The user clicked Issue from a stale
        // editor view; route them to the review screen where their
        // bundle actually is. Other 4xx/5xx errors surface inline.
        if (res.status === 409 && j.error === "illegal_transition") {
          router.replace(`/affirm/${bundleId}/review`);
          return;
        }
        setIssueError(
          j.error === "empty_scope"
            ? "Add at least one scope item before issuing."
            : j.error === "not_found"
              ? "Bundle no longer exists."
              : j.error ?? `Issue failed (${res.status}).`,
        );
        return;
      }
      router.replace(`/affirm/${bundleId}/review`);
    });
  }

  // Group rows by sub-process, preserving sort order.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; streamName: string; rows: EditorRow[] }>();
    for (const r of rows) {
      const g = m.get(r.subProcessId) ?? {
        name: r.subProcessName,
        streamName: r.streamName,
        rows: [],
      };
      g.rows.push(r);
      m.set(r.subProcessId, g);
    }
    for (const g of m.values()) {
      g.rows.sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return Array.from(m.entries());
  }, [rows]);

  const enabledCount = rows.filter((r) => r.enabled).length;
  const decisionCount = rows.filter((r) => r.enabled && r.format === "decision").length;
  const infoCount = rows.filter((r) => r.enabled && r.format === "information").length;
  const excludedDisabledCount = rows.filter((r) => !r.enabled && r.status === "excluded").length;
  const customCount = rows.filter((r) => r.isCustom).length;
  const editable = bundleState === "draft" || bundleState === "issued";

  return (
    <div className="space-y-5" data-tour="affirm-question-editor">
      {/* Top counts */}
      <div className="grid gap-3 sm:grid-cols-5">
        <Stat n={enabledCount} l="In bundle" />
        <Stat n={decisionCount} l="Decision" tone="cfg" />
        <Stat n={infoCount} l="Information" tone="muted" />
        <Stat n={excludedDisabledCount} l="Excluded" tone="cust" />
        <Stat n={customCount} l="Custom" tone="std" />
      </div>

      {/* Per sub-process */}
      {groups.map(([subId, g]) => (
        <section key={subId} className="space-y-3">
          <div className="flex items-end justify-between border-b border-border-default pb-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                {g.streamName}
              </p>
              <h2 className="font-serif text-xl text-navy">{g.name}</h2>
            </div>
            {editable && (
              <button
                onClick={() => setAddingFor(addingFor === subId ? null : subId)}
                className="inline-flex h-8 items-center rounded-input border border-navy bg-paper px-3 text-xs font-semibold text-navy hover:bg-navy-soft"
              >
                {addingFor === subId ? "Cancel" : "+ Add custom question"}
              </button>
            )}
          </div>

          {addingFor === subId && editable && (
            <div className="rounded-card-warm border-2 border-navy bg-navy-soft/40 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-navy">
                New consultant-added question
              </p>
              <textarea
                value={adding.wording}
                onChange={(e) => setAdding({ ...adding, wording: e.target.value })}
                rows={2}
                placeholder="Question wording (client-facing) — required."
                className="w-full rounded-input border border-border-default bg-paper p-2.5 text-sm focus:border-navy focus:outline-none"
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  value={adding.aboutText}
                  onChange={(e) => setAdding({ ...adding, aboutText: e.target.value })}
                  placeholder="About this question (optional)"
                  className="h-9 rounded-input border border-border-default bg-paper px-2.5 text-sm"
                />
                <input
                  value={adding.standardMeans}
                  onChange={(e) =>
                    setAdding({ ...adding, standardMeans: e.target.value })
                  }
                  placeholder="What 'Adopt standard' means (optional)"
                  className="h-9 rounded-input border border-border-default bg-paper px-2.5 text-sm"
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex gap-1">
                  <FormatBtn
                    on={adding.format === "decision"}
                    onClick={() => setAdding({ ...adding, format: "decision" })}
                  >
                    Decision
                  </FormatBtn>
                  <FormatBtn
                    on={adding.format === "information"}
                    onClick={() => setAdding({ ...adding, format: "information" })}
                  >
                    Information
                  </FormatBtn>
                </div>
                <button
                  onClick={() => addCustom(subId)}
                  disabled={busy === `add-${subId}` || !adding.wording.trim()}
                  className="ml-auto inline-flex h-9 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm hover:bg-cta-hover disabled:opacity-60"
                >
                  {busy === `add-${subId}` ? "Adding…" : "Add to bundle"}
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {g.rows.map((r, idx, arr) => {
              const draft = draftFor(r);
              const isFirst = idx === 0;
              const isLast = idx === arr.length - 1;
              return (
                <li
                  key={r.questionId}
                  className={`rounded-card-warm border bg-paper p-4 shadow-card ${
                    r.enabled ? "border-border-default" : "border-border-default opacity-60"
                  }`}
                >
                  <header className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-soft">
                      {r.sapTopic ?? r.sapArea ?? "General"}
                    </span>
                    <FormatBadge format={r.format} />
                    {r.isCustom && (
                      <span className="rounded-pill bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy">
                        consultant-added
                      </span>
                    )}
                    {r.flag === "config-how-to" && (
                      <span className="rounded-pill bg-banner-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-decision-custom">
                        flagged
                      </span>
                    )}
                    {r.status === "excluded" && (
                      <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                        SAP-excluded
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-ink-muted">
                      {r.questionId}
                    </span>
                  </header>

                  <label className="block text-[11px] font-medium text-ink-soft">
                    Plain-language wording (editable)
                  </label>
                  <textarea
                    value={draft.consultantWording}
                    onChange={(e) =>
                      setField(r.questionId, "consultantWording", e.target.value)
                    }
                    onBlur={() => draft.dirty && saveDraft(r.questionId)}
                    disabled={!editable}
                    rows={2}
                    className="mt-1 w-full rounded-input border border-border-default bg-paper p-2 text-sm focus:border-navy focus:outline-none"
                  />

                  {/* v2.1 §9: "Where this sits" preview — same component
                      the client sees on their affirm card. */}
                  {r.scopeItemRefs
                    .filter((ref) => flows[ref] || scopeDescriptions[ref])
                    .map((ref) => (
                      <div key={ref} className="mt-2">
                        <ProcessFlowStrip
                          variant="embedded"
                          scopeItemId={ref}
                          scopeItemDescription={scopeDescriptions[ref] ?? null}
                          flow={flows[ref] ?? null}
                        />
                      </div>
                    ))}

                  {/* SAP verbatim — read-only collapsible */}
                  {r.sapVerbatim && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-ink-muted hover:text-ink">
                        SAP verbatim (locked) — never editable
                      </summary>
                      <div className="mt-1 rounded-input bg-ink-tint px-3 py-2 text-ink-soft">
                        <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                          SAP verbatim · source of truth · never overwritten
                        </span>
                        <span className="mt-1 block">{r.sapVerbatim}</span>
                        {r.sscuiRef && r.sscuiRef !== "-" && r.sscuiRef !== "N/A" && (
                          <span className="mt-1 block font-mono text-ink-muted">
                            SSCUI: {r.sscuiRef}
                          </span>
                        )}
                      </div>
                    </details>
                  )}

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-medium text-ink-soft">
                        About this question
                      </label>
                      <textarea
                        value={draft.aboutText}
                        onChange={(e) =>
                          setField(r.questionId, "aboutText", e.target.value)
                        }
                        onBlur={() => draft.dirty && saveDraft(r.questionId)}
                        disabled={!editable}
                        rows={2}
                        placeholder="What this question is about — shown above the wording on the client card."
                        className="mt-1 w-full rounded-input border border-border-default bg-paper p-2 text-sm focus:border-navy focus:outline-none"
                      />
                    </div>
                    {r.format === "decision" && (
                      <div>
                        <label className="block text-[11px] font-medium text-ink-soft">
                          What &quot;Adopt SAP standard&quot; means here
                        </label>
                        <textarea
                          value={draft.standardMeans}
                          onChange={(e) =>
                            setField(r.questionId, "standardMeans", e.target.value)
                          }
                          onBlur={() => draft.dirty && saveDraft(r.questionId)}
                          disabled={!editable}
                          rows={2}
                          placeholder="Plain-language translation of the SAP standard — shown in the teal box on the client card."
                          className="mt-1 w-full rounded-input border border-border-default bg-paper p-2 text-sm focus:border-navy focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="flex gap-1">
                      <FormatBtn
                        on={r.format === "decision"}
                        onClick={() => setFormat(r, "decision")}
                        disabled={!editable || busy === r.questionId}
                      >
                        Decision
                      </FormatBtn>
                      <FormatBtn
                        on={r.format === "information"}
                        onClick={() => setFormat(r, "information")}
                        disabled={!editable || busy === r.questionId}
                      >
                        Information
                      </FormatBtn>
                    </div>

                    {/* .reorder-buttons / .reorder-btn — responsive
                        markup hooks. The design hides these on
                        desktop in favour of a drag handle; this app
                        has no drag handle so we keep them visible at
                        every breakpoint (deviation noted in
                        affirm-responsive.css). */}
                    <div className="reorder-buttons ml-3 flex items-center gap-1">
                      <IconBtn
                        title="Move up"
                        className="reorder-btn"
                        onClick={() => move(r, "up")}
                        disabled={!editable || isFirst || busy === r.questionId}
                      >
                        ↑
                      </IconBtn>
                      <IconBtn
                        title="Move down"
                        className="reorder-btn"
                        onClick={() => move(r, "down")}
                        disabled={!editable || isLast || busy === r.questionId}
                      >
                        ↓
                      </IconBtn>
                    </div>

                    <button
                      onClick={() => toggleEnabled(r)}
                      disabled={!editable || busy === r.questionId}
                      className={`ml-auto inline-flex h-8 items-center rounded-input border px-3 text-xs font-semibold transition ${
                        r.enabled
                          ? "border-border-default bg-paper text-ink hover:bg-ink-tint"
                          : "border-cta bg-cta/5 text-cta hover:bg-cta/10"
                      }`}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>

                    {r.isCustom && (
                      <button
                        onClick={() => deleteCustom(r)}
                        disabled={!editable || busy === r.questionId}
                        className="inline-flex h-8 items-center rounded-input border border-cta bg-paper px-3 text-xs font-semibold text-cta hover:bg-cta/5"
                      >
                        Delete
                      </button>
                    )}

                    {draft.dirty && (
                      <span className="text-xs text-ink-muted">unsaved…</span>
                    )}
                    {draft.error && (
                      <span className="text-xs text-cta">{draft.error}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Issue CTA (only in DRAFT) */}
      {bundleState === "draft" && (
        <div className="sticky bottom-4 mt-6 flex items-center gap-4 rounded-card-warm border border-border-default bg-paper px-[22px] py-4 shadow-card-warm-hover">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">
              {enabledCount} questions ready · {decisionCount} Decision ·{" "}
              {infoCount} Information
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              Issuing seals the scope + question set and unlocks the client affirm
              view. You can still keep editing wording until the client submits.
            </div>
            {issueError && (
              <p className="mt-2 rounded-md border border-cta/40 bg-paper px-3 py-2 text-xs text-cta">
                {issueError}
              </p>
            )}
          </div>
          <button
            onClick={issue}
            disabled={issuing || enabledCount === 0}
            data-tour="affirm-issue"
            className="inline-flex h-10 items-center rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
          >
            {issuing ? "Issuing…" : "Issue to client"}
          </button>
        </div>
      )}

      {bundleState === "issued" && (
        <div className="mt-6 rounded-card-warm border border-border-default bg-paper p-4 text-sm text-ink-soft">
          <strong className="text-ink">Bundle is live with the client.</strong> You
          can keep editing wording, format, and order — changes flow through to the
          client view immediately. Disable / enable also flows through.
        </div>
      )}
    </div>
  );
}

function Stat({
  n,
  l,
  tone,
}: {
  n: number;
  l: string;
  tone?: "std" | "cfg" | "cust" | "muted";
}) {
  const cls =
    tone === "std"
      ? "text-decision-standard"
      : tone === "cfg"
        ? "text-decision-configure"
        : tone === "cust"
          ? "text-decision-custom"
          : tone === "muted"
            ? "text-ink-muted"
            : "text-ink";
  return (
    <div className="rounded-card-warm border border-border-default bg-paper px-[18px] py-3">
      <p className={`font-serif text-2xl leading-none font-medium ${cls}`}>{n}</p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {l}
      </p>
    </div>
  );
}

function FormatBadge({ format }: { format: "decision" | "information" }) {
  return format === "decision" ? (
    <span className="rounded-pill bg-decision-configure/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-decision-configure">
      Decision
    </span>
  ) : (
    <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
      Information
    </span>
  );
}

function FormatBtn({
  on,
  onClick,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`fmt-opt inline-flex h-8 items-center rounded-input border px-3 text-xs font-semibold transition ${
        on
          ? "on border-navy bg-navy text-white"
          : "border-border-default bg-paper text-ink-soft hover:bg-ink-tint"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  onClick,
  disabled,
  title,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  /** Extra class names (e.g. .reorder-btn for the responsive pass). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex size-7 items-center justify-center rounded-input border border-border-default bg-paper text-sm text-ink-soft hover:bg-ink-tint disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
