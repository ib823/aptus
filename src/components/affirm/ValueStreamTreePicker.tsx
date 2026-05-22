"use client";

/**
 * Screen 1 — Consultant scope picker. Refit to match the
 * "Enhancement Restored" design's .scope-tree pattern:
 *
 *   - Parent rows are paper-surface chips with checkbox + name +
 *     right-aligned count. Selected parent = navy-soft bg.
 *   - Expanded sub-process rows live in a cream-surface block, with
 *     a coverage-chip pill ("affirm-set" / "no affirm-set") and the
 *     scope-item count.
 *   - Coverage is shown, never hidden — sub-processes with no BDC
 *     remain selectable but get the muted "no affirm-set" chip.
 *
 * Posts the final set to POST /api/affirm/bundles (mode=new) or
 * PUT /api/affirm/bundles/[id]/scope (mode=edit).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TreeStream } from "@/lib/affirm/queries";

interface Props {
  tree: TreeStream[];
  bundleId?: string;
  initialClient?: string;
  initialSelected?: string[];
  mode: "new" | "edit";
}

interface OpenState {
  [streamId: string]: boolean;
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
  const [open, setOpen] = useState<OpenState>({});
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
    coveredItems: number;
    totalItems: number;
  } {
    let s = 0;
    let c = 0;
    let t = 0;
    const stream = tree.find((x) => x.id === streamId);
    if (!stream) return { selectedItems: 0, coveredItems: 0, totalItems: 0 };
    for (const sp of stream.subProcesses) {
      for (const si of sp.scopeItems) {
        t++;
        if (selected.has(si.id)) {
          s++;
          if (si.hasBdcCoverage) c++;
        }
      }
    }
    return { selectedItems: s, coveredItems: c, totalItems: t };
  }

  // ── Actions ─────────────────────────────────────────────────────
  const toggleStream = (id: string) =>
    setOpen((m) => ({ ...m, [id]: !m[id] }));

  const toggleItem = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSubProcess = (ids: string[]) =>
    setSelected((s) => {
      const next = new Set(s);
      const allIn = ids.every((id) => next.has(id));
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
          router.push(`/affirm/${json.id}/review`);
        } else if (bundleId) {
          const res = await fetch(`/api/affirm/bundles/${bundleId}/scope`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scopeItemIds: ids }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
          router.push(`/affirm/${bundleId}/review`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
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

          <input
            type="search"
            placeholder="Filter by scope code or text…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-3 h-10 w-full rounded-input border border-border-default bg-paper px-3 text-sm placeholder:text-ink-muted focus:border-navy focus:outline-none"
          />

          <div className="flex flex-col gap-1.5">
            {visibleTree.map((s) => {
              const counts = streamSelectionCount(s.id);
              const isOpen = open[s.id] ?? filterLc !== "";
              const hasAny = counts.selectedItems > 0;
              return (
                <div key={s.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => toggleStream(s.id)}
                    className={`flex items-center gap-3 rounded-input border px-4 py-3 text-left transition ${
                      hasAny
                        ? "border-navy bg-navy-soft"
                        : "border-border-default bg-paper hover:bg-ink-tint"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] ${
                        hasAny
                          ? "border-navy bg-navy"
                          : "border-border-strong bg-paper"
                      }`}
                    >
                      {hasAny && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-ink">{s.name}</span>
                    {s.isFoundation && (
                      <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-soft">
                        foundation
                      </span>
                    )}
                    <span className="ml-auto whitespace-nowrap font-mono text-xs text-ink-soft">
                      <span className="font-semibold text-ink">{counts.totalItems}</span> items
                      <span className="text-ink-muted">
                        {" "}
                        · {counts.coveredItems > 0 ? counts.coveredItems : "0"} with affirm-set
                      </span>
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`text-ink-muted transition ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="ml-8 flex flex-col gap-1">
                      {s.subProcesses.map((sp) => {
                        const allIds = sp.scopeItems.map((si) => si.id);
                        const selCount = allIds.filter((id) => selected.has(id)).length;
                        const allSelected =
                          allIds.length > 0 && selCount === allIds.length;
                        return (
                          <div key={sp.id} className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => toggleSubProcess(allIds)}
                              className="flex items-center gap-3 rounded-input border border-transparent bg-cream px-3.5 py-2.5 text-left hover:border-border-default"
                            >
                              <span
                                aria-hidden="true"
                                className={`inline-flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] ${
                                  allSelected
                                    ? "border-navy bg-navy"
                                    : selCount > 0
                                      ? "border-navy bg-paper"
                                      : "border-border-strong bg-paper"
                                }`}
                              >
                                {allSelected ? (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="3"
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : selCount > 0 ? (
                                  <span className="block size-2 rounded-sm bg-navy" />
                                ) : null}
                              </span>
                              <span className="text-sm font-medium text-ink">{sp.name}</span>
                              <span
                                className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  sp.hasAnyBdcCoverage
                                    ? "bg-status-signed-bg text-status-signed-fg"
                                    : "bg-ink-tint text-ink-muted"
                                }`}
                              >
                                {sp.hasAnyBdcCoverage ? "affirm-set" : "no affirm-set"}
                              </span>
                              <span className="ml-auto font-mono text-[11px] text-ink-soft tabular-nums">
                                <span className="font-semibold text-ink">{selCount}</span>/{allIds.length} items
                              </span>
                            </button>

                            {selCount > 0 || filterLc ? (
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
                                      onChange={() => toggleItem(si.id)}
                                      className="mt-1 size-3.5 rounded border-border-strong accent-navy"
                                    />
                                    <label
                                      htmlFor={`si-${si.id}`}
                                      className="flex flex-1 cursor-pointer flex-wrap items-center gap-2"
                                    >
                                      <code className="rounded bg-ink-tint px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                                        {si.id}
                                      </code>
                                      <span className="text-ink-soft">
                                        {si.description}
                                      </span>
                                      {si.hasBdcCoverage && (
                                        <span className="rounded-pill bg-decision-standard/15 px-2 text-[10px] font-bold uppercase tracking-wider text-decision-standard">
                                          BDC
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
                            ) : null}
                          </div>
                        );
                      })}
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
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
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
            {pending ? "Saving…" : mode === "new" ? "Create bundle" : "Save scope"}
          </button>
          <p className="mt-3 text-xs text-ink-muted">
            Next: review the in-scope L2 questions, then issue the bundle to the client.
          </p>
        </div>
      </aside>
    </div>
  );
}
