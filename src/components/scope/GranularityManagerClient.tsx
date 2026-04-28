"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

interface Row {
  id: string;
  scopeItemId: string;
  name: string;
  functionalArea: string;
  totalSteps: number;
  granularity: string; // coarse | medium | fine
  assessmentVerdict: string | null;
  notes: string | null;
  upgradedAt: string | null;
}

interface UpgradeSuggestion {
  scopeItemId: string;
  scopeItemName: string;
  currentGranularity: string;
  suggestedGranularity: string;
  reason: string;
  triggerRule: number;
  impactScore: number;
}

interface Props {
  assessmentId: string;
  companyName: string;
  rollup: { coarse: number; medium: number; fine: number };
  rows: Row[];
}

const VERDICT_LABELS: Record<string, string> = {
  mostly_fit: "Mostly FIT",
  mostly_config: "Mostly Configuration",
  has_gaps: "Has Gaps",
  needs_workshop: "Needs Workshop",
};

const GRANULARITY_BADGES: Record<
  string,
  { label: string; color: string; description: string }
> = {
  // Phase 11 — UI labels renamed Coarse/Medium/Fine → Summary/Detailed/Per-step.
  // DB enum values + audit log retain coarse/medium/fine for stability; only
  // user-facing surfaces change. Per AD-8.
  coarse: {
    label: "Summary",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Auto-FIT — no review yet",
  },
  medium: {
    label: "Detailed",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Verdict + notes captured",
  },
  fine: {
    label: "Per-step",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Step-level classification",
  },
};

export function GranularityManagerClient({
  assessmentId,
  companyName,
  rollup: initialRollup,
  rows: initialRows,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [rollup, setRollup] = useState(initialRollup);
  const [filter, setFilter] = useState<string>("all"); // all | coarse | medium | fine
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<UpgradeSuggestion[] | null>(null);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/scope/upgrade-suggestions`);
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { suggestions?: UpgradeSuggestion[] };
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    })();
  }, [assessmentId]);

  const visibleSuggestions = useMemo(
    () => (suggestions ?? []).filter((s) => !dismissedIds.has(s.scopeItemId)),
    [suggestions, dismissedIds],
  );

  function dismissSuggestion(scopeItemId: string): void {
    setDismissedIds((prev) => new Set(prev).add(scopeItemId));
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.granularity !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.scopeItemId.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filter, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const k = r.functionalArea?.trim() || "(Uncategorized)";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  function applyUpdate(rowId: string, patch: Partial<Row>): void {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  function applyRollup(next: { coarse: number; medium: number; fine: number }): void {
    setRollup(next);
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Granularity Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {companyName} · Progressive FIT-to-Standard elaboration. Each scope
          item starts at <strong>Summary</strong> (Auto-FIT) and is upgraded only
          where the engagement requires depth.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <RollupCard label="Summary" value={rollup.coarse} colorClass="bg-emerald-50 text-emerald-700 border-emerald-200" hint="Auto-FIT, no review" />
        <RollupCard label="Detailed" value={rollup.medium} colorClass="bg-amber-50 text-amber-700 border-amber-200" hint="Verdict + notes" />
        <RollupCard label="Per-step" value={rollup.fine} colorClass="bg-blue-50 text-blue-700 border-blue-200" hint="Step-level detail" />
      </div>

      {visibleSuggestions.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/50">
          <button
            type="button"
            onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="text-sm font-semibold text-amber-900">
              ⚠ {visibleSuggestions.length} suggested upgrade{visibleSuggestions.length === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-amber-700">
              {suggestionsExpanded ? "Hide" : "Show"}
            </div>
          </button>
          {suggestionsExpanded && (
            <div className="px-4 pb-3 space-y-2 max-h-96 overflow-y-auto">
              {visibleSuggestions.slice(0, 12).map((s) => (
                <SuggestionItem
                  key={s.scopeItemId}
                  suggestion={s}
                  assessmentId={assessmentId}
                  onApplied={(patch, nextRollup) => {
                    setRows((prev) => prev.map((r) => r.scopeItemId === s.scopeItemId ? { ...r, ...patch } : r));
                    setRollup(nextRollup);
                    dismissSuggestion(s.scopeItemId);
                  }}
                  onDismiss={() => dismissSuggestion(s.scopeItemId)}
                />
              ))}
              {visibleSuggestions.length > 12 && (
                <div className="text-xs text-muted-foreground text-center pt-2">
                  +{visibleSuggestions.length - 12} more — review the rest as you go
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">All ({rows.length})</option>
          <option value="coarse">Summary ({rollup.coarse})</option>
          <option value="medium">Detailed ({rollup.medium})</option>
          <option value="fine">Per-step ({rollup.fine})</option>
        </select>
        <input
          type="search"
          placeholder="Search scope ID or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
        <span className="text-sm text-muted-foreground">
          Showing {filtered.length}
        </span>
      </div>

      <div className="space-y-6">
        {grouped.map(([area, items]) => (
          <div key={area} className="rounded border border-input bg-background">
            <div className="px-4 py-2 bg-muted/40 text-sm font-semibold text-foreground border-b border-input">
              {area} <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
            </div>
            <div>
              {items.map((r) => (
                <ScopeRow
                  key={r.id}
                  row={r}
                  assessmentId={assessmentId}
                  isEditing={editingId === r.id}
                  onEdit={() => setEditingId(r.id)}
                  onCancel={() => setEditingId(null)}
                  onSaved={(patch, nextRollup) => {
                    applyUpdate(r.id, patch);
                    applyRollup(nextRollup);
                    setEditingId(null);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            No scope items match the filter.
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionItem({
  suggestion,
  assessmentId,
  onApplied,
  onDismiss,
}: {
  suggestion: UpgradeSuggestion;
  assessmentId: string;
  onApplied: (
    patch: Partial<Row>,
    nextRollup: { coarse: number; medium: number; fine: number },
  ) => void;
  onDismiss: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          // Default verdict for Medium upgrades — consultant can refine in Edit panel later
          const verdict = suggestion.suggestedGranularity === "medium" ? "has_gaps" : null;
          const res = await fetch(
            `/api/assessments/${assessmentId}/scope/${suggestion.scopeItemId}/granularity`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                granularity: suggestion.suggestedGranularity,
                assessmentVerdict: verdict,
                notes: `Auto-upgraded based on rule ${suggestion.triggerRule}: ${suggestion.reason}`,
              }),
            },
          );
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            rollup?: { coarse: number; medium: number; fine: number };
          };
          if (!res.ok || !data.ok) {
            setError(data.error ?? `Apply failed (${res.status})`);
            return;
          }
          onApplied(
            {
              granularity: suggestion.suggestedGranularity,
              assessmentVerdict: verdict,
              notes: `Auto-upgraded based on rule ${suggestion.triggerRule}: ${suggestion.reason}`,
              upgradedAt: new Date().toISOString(),
            },
            data.rollup ?? { coarse: 0, medium: 0, fine: 0 },
          );
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    });
  }

  return (
    <div className="rounded border border-amber-200 bg-white p-3 text-sm">
      <div className="flex items-start gap-3">
        <code className="font-mono text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 shrink-0 mt-0.5">
          {suggestion.scopeItemId}
        </code>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-900">
            {suggestion.scopeItemName}
            <span className="ml-2 text-xs text-amber-700 font-normal">
              {suggestion.currentGranularity} → {suggestion.suggestedGranularity}
            </span>
          </div>
          <div className="text-xs text-amber-800 mt-1">{suggestion.reason}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="text-xs px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            className="text-xs px-3 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100 text-amber-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function RollupCard({
  label,
  value,
  colorClass,
  hint,
}: {
  label: string;
  value: number;
  colorClass: string;
  hint: string;
}) {
  return (
    <div className={`rounded border p-3 ${colorClass}`}>
      <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs mt-1 opacity-80">{hint}</div>
    </div>
  );
}

function ScopeRow({
  row,
  assessmentId,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
}: {
  row: Row;
  assessmentId: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (patch: Partial<Row>, nextRollup: { coarse: number; medium: number; fine: number }) => void;
}) {
  const badge = GRANULARITY_BADGES[row.granularity] ?? GRANULARITY_BADGES.coarse!;

  return (
    <div className="border-b border-input last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
        <code className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground w-16 text-center shrink-0">
          {row.scopeItemId}
        </code>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{row.name}</div>
          {row.assessmentVerdict && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Verdict: <strong>{VERDICT_LABELS[row.assessmentVerdict]}</strong>
              {row.notes && ` · ${row.notes.slice(0, 80)}${row.notes.length > 80 ? "…" : ""}`}
            </div>
          )}
          {!row.assessmentVerdict && (
            <div className="text-xs text-muted-foreground mt-0.5 italic">{badge.description}</div>
          )}
        </div>
        <div className="text-xs text-muted-foreground shrink-0 hidden md:block">
          {row.totalSteps} steps
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${badge.color}`}
        >
          {badge.label}
        </span>
        <button
          type="button"
          onClick={isEditing ? onCancel : onEdit}
          className="text-xs px-3 py-1 rounded border border-input bg-background hover:bg-muted shrink-0"
        >
          {isEditing ? "Cancel" : "Edit"}
        </button>
      </div>
      {isEditing && (
        <EditPanel
          row={row}
          assessmentId={assessmentId}
          onCancel={onCancel}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function EditPanel({
  row,
  assessmentId,
  onCancel,
  onSaved,
}: {
  row: Row;
  assessmentId: string;
  onCancel: () => void;
  onSaved: (patch: Partial<Row>, nextRollup: { coarse: number; medium: number; fine: number }) => void;
}) {
  const [granularity, setGranularity] = useState(row.granularity);
  const [verdict, setVerdict] = useState(row.assessmentVerdict ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function save(): Promise<void> {
    setError(null);
    const body: Record<string, unknown> = { granularity, notes };
    if (granularity === "medium") {
      if (!verdict) {
        setError("Verdict is required when upgrading to Medium.");
        return;
      }
      body.assessmentVerdict = verdict;
    } else if (granularity === "fine") {
      body.assessmentVerdict = verdict || null;
    } else {
      body.assessmentVerdict = null;
    }

    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/assessments/${assessmentId}/scope/${row.scopeItemId}/granularity`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            rollup?: { coarse: number; medium: number; fine: number };
          };
          if (!res.ok || !data.ok) {
            setError(data.error ?? `Save failed (${res.status})`);
            return;
          }
          onSaved(
            {
              granularity,
              assessmentVerdict: granularity === "coarse" ? null : verdict || null,
              notes,
              upgradedAt: new Date().toISOString(),
            },
            data.rollup ?? { coarse: 0, medium: 0, fine: 0 },
          );
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    });
  }

  return (
    <div className="px-4 py-4 bg-muted/20 border-t border-input space-y-3">
      <div>
        <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">
          Granularity tier
        </label>
        <div className="flex gap-2 flex-wrap">
          {(["coarse", "medium", "fine"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              disabled={pending}
              className={`px-3 py-1.5 rounded border text-sm ${
                granularity === g
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-background hover:bg-muted"
              }`}
            >
              {GRANULARITY_BADGES[g]!.label}
            </button>
          ))}
        </div>
      </div>

      {(granularity === "medium" || granularity === "fine") && (
        <div>
          <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">
            Verdict {granularity === "medium" && <span className="text-red-600">*</span>}
          </label>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            disabled={pending}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— select —</option>
            <option value="mostly_fit">Mostly FIT — only configuration tweaks</option>
            <option value="mostly_config">Mostly Configuration</option>
            <option value="has_gaps">Has gaps — workshop attention needed</option>
            <option value="needs_workshop">Workshop required — too uncertain</option>
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">
          Notes (visible on report)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          rows={3}
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
          placeholder="What's the FIT-to-Standard story for this scope item?"
        />
      </div>

      {granularity === "fine" && (
        <div className="text-xs text-muted-foreground">
          Fine mode unlocks step-level review. Drill into the existing{" "}
          <a
            href={`/assessment/${assessmentId}/review?scopeItemId=${row.scopeItemId}`}
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Step Review tab →
          </a>{" "}
          to classify each of {row.totalSteps} steps.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm px-3 py-1.5 rounded border border-input bg-background hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-sm px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
