"use client";

/**
 * Screen 1 — Consultant scope picker. v2 (CCC follow-up) refit.
 *
 * The eight changes that affect this component:
 *   §1 Value-stream rows use a chevron (disclosure), NOT a checkbox.
 *      Streams are navigation containers — not selectable.
 *   §2 The three tiers are labelled in the tree (Tier 1 / 2 / 3).
 *   §3 Scope items start UNCHECKED. The consultant opts items in. Each
 *      sub-process has a tri-state checkbox (Select all / Clear) that
 *      reflects how many children are selected.
 *   §5 Every scope item shows a coverage badge — "N questions" when
 *      the item carries an affirm-set, or "no affirm-set" otherwise.
 *      Counts roll up to the sub-process and stream rows.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TreeStream } from "@/lib/affirm/queries";

interface Props {
  tree: TreeStream[];
  bundleId?: string;
  initialClient?: string;
  initialSelected?: string[];
  mode: "new" | "edit";
}

export function ValueStreamTreePicker({
  tree,
  bundleId,
  initialClient = "",
  initialSelected = [],
  mode,
}: Props) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  // Sub-processes expanded WITHIN a stream — value stream rows control
  // the visibility of the sub-process list; sub-process rows then
  // expand to reveal individual scope items.
  const [openStreams, setOpenStreams] = useState<Record<string, boolean>>({});
  const [openSubs, setOpenSubs] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelected),
  );
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Derived state ───────────────────────────────────────────────
  const filterLc = filter.trim().toLowerCase();
  const visibleTree = useMemo(() => {
    if (!filterLc) return tree;
    return tree
      .map((s) => {
        const subs = s.subProcesses
          .map((sp) => ({
            ...sp,
            scopeItems: sp.scopeItems.filter(
              (si) =>
                si.id.toLowerCase().includes(filterLc) ||
                si.description.toLowerCase().includes(filterLc),
            ),
          }))
          .filter(
            (sp) =>
              sp.scopeItems.length > 0 ||
              sp.name.toLowerCase().includes(filterLc),
          );
        return { ...s, subProcesses: subs };
      })
      .filter(
        (s) =>
          s.subProcesses.length > 0 ||
          s.name.toLowerCase().includes(filterLc),
      );
  }, [filterLc, tree]);

  const totalSelected = selected.size;
  const coverageSelected = useMemo(() => {
    let withBdc = 0;
    for (const s of tree) {
      for (const sp of s.subProcesses) {
        for (const si of sp.scopeItems) {
          if (selected.has(si.id) && si.hasBdcCoverage) withBdc++;
        }
      }
    }
    return withBdc;
  }, [selected, tree]);

  function streamSelectionCount(streamId: string): {
    selectedItems: number;
    totalItems: number;
  } {
    const stream = tree.find((x) => x.id === streamId);
    if (!stream) return { selectedItems: 0, totalItems: 0 };
    let s = 0;
    let t = 0;
    for (const sp of stream.subProcesses) {
      for (const si of sp.scopeItems) {
        t++;
        if (selected.has(si.id)) s++;
      }
    }
    return { selectedItems: s, totalItems: t };
  }

  // ── Actions ─────────────────────────────────────────────────────
  // v2 §1: stream rows toggle expansion only — no selection.
  const toggleStream = (id: string) =>
    setOpenStreams((m) => ({ ...m, [id]: !m[id] }));
  const toggleSub = (id: string) =>
    setOpenSubs((m) => ({ ...m, [id]: !m[id] }));

  const toggleItem = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // v2 §3: tri-state Select all / Clear at the sub-process level.
  const toggleSubProcessSelectAll = (ids: string[]) =>
    setSelected((s) => {
      const next = new Set(s);
      const allIn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });

  async function save() {
    setError(null);
    if (!client.trim()) {
      setError("Add a client / project label.");
      return;
    }
    if (selected.size === 0) {
      setError("Pick at least one scope item.");
      return;
    }
    const ids = Array.from(selected);
    startTransition(async () => {
      try {
        if (mode === "new") {
          const res = await fetch("/api/affirm/bundles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ client: client.trim(), scopeItemIds: ids }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
          const json = (await res.json()) as { id: string };
          // v2 §4: editor is the next step after scope.
          router.push(`/affirm/${json.id}/questions`);
        } else if (bundleId) {
          const res = await fetch(`/api/affirm/bundles/${bundleId}/scope`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scopeItemIds: ids }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
          router.push(`/affirm/${bundleId}/questions`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4" data-tour="affirm-tree">
        {/* Filter + scope-tree card */}
        <div className="rounded-card-warm border border-border-default bg-paper p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Value-stream picker
              </p>
              <h3 className="mt-1 font-serif text-xl text-ink">Pick the streams in scope</h3>
            </div>
            <span className="font-mono text-xs text-ink-soft">
              672 items · 8 streams · 1 foundation
            </span>
          </div>

          {/* v2 §2: tier labels */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-ink-muted">
            <span>
              <span className="mr-1.5 inline-flex size-4 items-center justify-center rounded bg-navy-soft text-[10px] font-bold text-navy">
                1
              </span>
              Tier 1 — value stream
            </span>
            <span>
              <span className="mr-1.5 inline-flex size-4 items-center justify-center rounded bg-ink-tint text-[10px] font-bold text-ink-soft">
                2
              </span>
              Tier 2 — sub-process
            </span>
            <span>
              <span className="mr-1.5 inline-flex size-4 items-center justify-center rounded bg-cream text-[10px] font-bold text-ink-soft">
                3
              </span>
              Tier 3 — scope item
            </span>
          </div>

          <input
            type="search"
            placeholder="Filter by scope code or text…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-3 h-10 w-full rounded-input border border-border-default bg-paper px-3 text-sm placeholder:text-ink-muted focus:border-navy focus:outline-none"
          />

          <div className="flex flex-col gap-1.5">
            {visibleTree.map((stream) => {
              const counts = streamSelectionCount(stream.id);
              const isOpen = openStreams[stream.id] ?? filterLc !== "";
              return (
                <div key={stream.id} className="flex flex-col gap-1">
                  {/* v2 §1: chevron-only stream row, NO checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleStream(stream.id)}
                    aria-expanded={isOpen}
                    aria-controls={`sub-of-${stream.id}`}
                    className={`flex items-center gap-3 rounded-input border px-4 py-3 text-left transition ${
                      counts.selectedItems > 0
                        ? "border-navy bg-navy-soft"
                        : "border-border-default bg-paper hover:bg-ink-tint"
                    }`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`text-ink-soft transition ${isOpen ? "rotate-90" : ""}`}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="text-sm font-semibold text-ink">
                      {stream.name}
                    </span>
                    {stream.isFoundation && (
                      <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-soft">
                        foundation
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2 whitespace-nowrap font-mono text-xs text-ink-soft">
                      {counts.selectedItems > 0 && (
                        <span className="rounded-pill bg-navy/10 px-2 text-[10px] font-bold uppercase tracking-wider text-navy">
                          {counts.selectedItems} selected
                        </span>
                      )}
                      <span>
                        <span className="font-semibold text-ink">{stream.totalScopeItems}</span> items
                      </span>
                      <span className="text-ink-muted">
                        ·{" "}
                        {stream.questionCount > 0
                          ? `${stream.questionCount} questions`
                          : "no affirm-set"}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      id={`sub-of-${stream.id}`}
                      className="ml-7 flex flex-col gap-1"
                    >
                      {stream.subProcesses.map((sp) => (
                        <SubProcessRow
                          key={sp.id}
                          subProcess={sp}
                          isOpen={openSubs[sp.id] ?? filterLc !== ""}
                          onToggleOpen={() => toggleSub(sp.id)}
                          selected={selected}
                          onSelectAll={toggleSubProcessSelectAll}
                          onToggleItem={toggleItem}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Coverage note banner */}
        <div className="grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-[#E5D6A8] bg-banner-warn p-4 text-sm leading-5 text-ink-soft">
          <svg
            className="mt-px text-[#8B5A00]"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div>
            <strong className="text-ink">Coverage shown, not hidden.</strong>{" "}
            152 of 672 scope items carry SAP Business-Driven Configuration questions.
            Sub-processes without an affirm-set remain selectable for scope but carry no
            pre-workshop questions — the workbench flags this rather than implying full
            coverage.
          </div>
        </div>
      </div>

      {/* Side panel */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" data-tour="affirm-selection">
        <div className="rounded-card-warm border border-border-default bg-paper p-5 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Bundle
          </p>
          <label className="mt-3 block text-xs font-medium text-ink-soft">
            Client / project
          </label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="e.g. Acme Corp — F2S 2026"
            className="mt-1 h-10 w-full rounded-input border border-border-default bg-paper px-3 text-sm focus:border-navy focus:outline-none"
            disabled={mode === "edit"}
          />

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Scope items</dt>
              <dd className="tabular-nums text-ink">{totalSelected}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">With BDC affirm-set</dt>
              <dd className="tabular-nums text-decision-standard">
                {coverageSelected}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">No affirm-set</dt>
              <dd className="tabular-nums text-decision-custom">
                {totalSelected - coverageSelected}
              </dd>
            </div>
          </dl>

          {error && (
            <p className="mt-4 rounded-md border border-cta/40 bg-cta/5 px-3 py-2 text-sm text-cta">
              {error}
            </p>
          )}

          <button
            onClick={save}
            disabled={pending}
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-input bg-cta px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
          >
            {pending
              ? "Saving…"
              : mode === "new"
                ? "Create bundle"
                : "Save scope"}
          </button>
          <p className="mt-3 text-xs text-ink-muted">
            Next: review the in-scope L2 questions in the question editor before
            issuing to the client.
          </p>
        </div>
      </aside>
    </div>
  );
}

// ─── SubProcess row (split for clarity + tri-state checkbox) ─────

function SubProcessRow({
  subProcess: sp,
  isOpen,
  onToggleOpen,
  selected,
  onSelectAll,
  onToggleItem,
}: {
  subProcess: TreeStream["subProcesses"][number];
  isOpen: boolean;
  onToggleOpen: () => void;
  selected: Set<string>;
  onSelectAll: (ids: string[]) => void;
  onToggleItem: (id: string) => void;
}) {
  const cbRef = useRef<HTMLInputElement>(null);
  const allIds = sp.scopeItems.map((si) => si.id);
  const selCount = allIds.filter((id) => selected.has(id)).length;
  const allSelected = allIds.length > 0 && selCount === allIds.length;
  const indeterminate = selCount > 0 && selCount < allIds.length;

  // Tri-state requires imperative .indeterminate set.
  useEffect(() => {
    if (cbRef.current) cbRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-input border border-transparent bg-cream px-3.5 py-2.5 hover:border-border-default">
        {/* v2 §3: tri-state Select-all checkbox */}
        <label className="inline-flex cursor-pointer items-center">
          <input
            ref={cbRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => onSelectAll(allIds)}
            disabled={allIds.length === 0}
            aria-label={`Select all ${sp.scopeItems.length} scope items in ${sp.name}`}
            className="size-4 cursor-pointer rounded border-[1.5px] border-border-strong accent-navy"
          />
        </label>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`text-ink-muted transition ${isOpen ? "rotate-90" : ""}`}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="text-sm font-medium text-ink">{sp.name}</span>
          {/* v2 §5: coverage badge per sub-process */}
          {sp.questionCount > 0 ? (
            <span className="rounded-pill bg-status-signed-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-signed-fg">
              {sp.questionCount} questions
            </span>
          ) : (
            <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              no affirm-set
            </span>
          )}
          <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-soft">
            <span className="font-semibold text-ink">{selCount}</span>/{allIds.length}{" "}
            items
          </span>
        </button>
      </div>

      {isOpen && (
        <ul className="ml-7 flex flex-col gap-0.5">
          {sp.scopeItems.map((si) => (
            <li
              key={si.id}
              className="flex items-start gap-2 px-2 py-1 text-[13px]"
            >
              <input
                type="checkbox"
                id={`si-${si.id}`}
                checked={selected.has(si.id)}
                onChange={() => onToggleItem(si.id)}
                className="mt-1 size-3.5 rounded border-border-strong accent-navy"
              />
              <label
                htmlFor={`si-${si.id}`}
                className="flex flex-1 cursor-pointer flex-wrap items-center gap-2"
              >
                <code className="rounded bg-ink-tint px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                  {si.id}
                </code>
                <span className="text-ink-soft">{si.description}</span>
                {/* v2 §5: coverage badge per scope item */}
                {si.questionCount > 0 ? (
                  <span className="rounded-pill bg-decision-standard/15 px-2 text-[10px] font-bold uppercase tracking-wider text-decision-standard">
                    {si.questionCount} question{si.questionCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="rounded-pill bg-ink-tint px-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                    no affirm-set
                  </span>
                )}
                {si.placementReviewFlag && (
                  <span
                    title="Layer-0 placement pending consultant curation"
                    className="rounded-pill bg-banner-warn px-2 text-[10px] font-bold uppercase tracking-wider text-decision-custom"
                  >
                    pending review
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
