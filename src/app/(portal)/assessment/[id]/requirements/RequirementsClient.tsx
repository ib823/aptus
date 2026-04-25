"use client";

import { useMemo, useState, useTransition } from "react";

interface Requirement {
  id: string;
  module: string;
  section: string | null;
  code: string;
  requirementText: string;
  requirementType: string | null;
  clientRemarks: string | null;
  solutionProviderResponse: string | null;
  solutionProviderRemarks: string | null;
  erpModuleSupporting: string | null;
}

interface Props {
  assessmentId: string;
  companyName: string;
  requirements: Requirement[];
  byModule: Record<string, { total: number; mandatory: number }>;
}

const RESPONSE_OPTIONS = [
  "O - Out Of The Box",
  "C - Configuration",
  "G - Gap",
  "X - Out Of Scope",
  "F - Future Roadmap",
];

export function RequirementsClient({
  assessmentId,
  companyName,
  requirements: initial,
  byModule,
}: Props) {
  const [requirements, setRequirements] = useState(initial);
  const [moduleFilter, setModuleFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const modules = useMemo(
    () => Object.keys(byModule).sort(),
    [byModule],
  );

  const filtered = useMemo(() => {
    return requirements.filter((r) => {
      if (moduleFilter !== "All" && r.module !== moduleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          r.code,
          r.section ?? "",
          r.requirementText,
          r.solutionProviderResponse ?? "",
          r.solutionProviderRemarks ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [requirements, moduleFilter, search]);

  // Group by module → section for the table
  const groups = useMemo(() => {
    const map = new Map<string, Map<string, Requirement[]>>();
    for (const r of filtered) {
      if (!map.has(r.module)) map.set(r.module, new Map());
      const sectionKey = r.section ?? "(no section)";
      const inner = map.get(r.module)!;
      if (!inner.has(sectionKey)) inner.set(sectionKey, []);
      inner.get(sectionKey)!.push(r);
    }
    return map;
  }, [filtered]);

  function updateLocal(id: string, patch: Partial<Requirement>): void {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Client Requirements
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {companyName} · {requirements.length} requirements across{" "}
          {modules.length} modules. Edit the Solution Provider Response,
          Remarks, and ERP Module columns inline.
        </p>
      </div>

      <AiAnalysisBanner assessmentId={assessmentId} />


      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="All">All modules ({requirements.length})</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m} ({byModule[m]?.total ?? 0})
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search code, text, response..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
        <a
          href={`/api/assessments/${assessmentId}/requirements/export`}
          className="rounded border border-input bg-background hover:bg-muted px-3 py-1.5 text-sm font-medium"
        >
          Export XLSX
        </a>
        <span className="text-sm text-muted-foreground">
          Showing {filtered.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-input">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left px-2 py-2 w-16">Code</th>
              <th className="text-left px-2 py-2 w-24">Type</th>
              <th className="text-left px-2 py-2 min-w-[320px]">
                Client Requirement
              </th>
              <th className="text-left px-2 py-2 min-w-[180px]">
                SP Response <span className="text-blue-600">(editable)</span>
              </th>
              <th className="text-left px-2 py-2 min-w-[260px]">
                SP Remarks <span className="text-blue-600">(editable)</span>
              </th>
              <th className="text-left px-2 py-2 min-w-[180px]">
                ERP Module <span className="text-blue-600">(editable)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from(groups.entries()).map(([module, sections]) => (
              <ModuleBlock
                key={module}
                module={module}
                sections={sections}
                assessmentId={assessmentId}
                onLocalUpdate={updateLocal}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No requirements match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModuleBlock({
  module,
  sections,
  assessmentId,
  onLocalUpdate,
}: {
  module: string;
  sections: Map<string, Requirement[]>;
  assessmentId: string;
  onLocalUpdate: (id: string, patch: Partial<Requirement>) => void;
}) {
  return (
    <>
      <tr className="bg-blue-50/60 dark:bg-blue-950/30">
        <td colSpan={6} className="px-3 py-2 font-bold text-foreground">
          {module}
        </td>
      </tr>
      {Array.from(sections.entries()).map(([section, reqs]) => (
        <SectionBlock
          key={section}
          section={section}
          reqs={reqs}
          assessmentId={assessmentId}
          onLocalUpdate={onLocalUpdate}
        />
      ))}
    </>
  );
}

function SectionBlock({
  section,
  reqs,
  assessmentId,
  onLocalUpdate,
}: {
  section: string;
  reqs: Requirement[];
  assessmentId: string;
  onLocalUpdate: (id: string, patch: Partial<Requirement>) => void;
}) {
  return (
    <>
      <tr className="bg-muted/30">
        <td
          colSpan={6}
          className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        >
          {section}
        </td>
      </tr>
      {reqs.map((r) => (
        <RequirementRow
          key={r.id}
          r={r}
          assessmentId={assessmentId}
          onLocalUpdate={onLocalUpdate}
        />
      ))}
    </>
  );
}

function RequirementRow({
  r,
  assessmentId,
  onLocalUpdate,
}: {
  r: Requirement;
  assessmentId: string;
  onLocalUpdate: (id: string, patch: Partial<Requirement>) => void;
}) {
  const isMandatory = r.requirementType?.toLowerCase().startsWith("mandatory");
  return (
    <tr className="border-t border-border/60 align-top hover:bg-muted/20">
      <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">{r.code}</td>
      <td className="px-2 py-2 text-xs">
        {isMandatory ? (
          <span className="inline-block px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-medium">
            Mandatory
          </span>
        ) : (
          <span className="text-muted-foreground">{r.requirementType ?? "—"}</span>
        )}
      </td>
      <td className="px-2 py-2 whitespace-pre-wrap">{r.requirementText}</td>
      <td className="px-2 py-2">
        <EditableSelect
          value={r.solutionProviderResponse ?? ""}
          options={RESPONSE_OPTIONS}
          onSave={async (next) => {
            await saveField(assessmentId, r.id, {
              solutionProviderResponse: next,
            });
            onLocalUpdate(r.id, { solutionProviderResponse: next });
          }}
        />
      </td>
      <td className="px-2 py-2">
        <EditableTextarea
          value={r.solutionProviderRemarks ?? ""}
          onSave={async (next) => {
            await saveField(assessmentId, r.id, {
              solutionProviderRemarks: next,
            });
            onLocalUpdate(r.id, { solutionProviderRemarks: next });
          }}
        />
      </td>
      <td className="px-2 py-2">
        <EditableTextarea
          value={r.erpModuleSupporting ?? ""}
          onSave={async (next) => {
            await saveField(assessmentId, r.id, {
              erpModuleSupporting: next,
            });
            onLocalUpdate(r.id, { erpModuleSupporting: next });
          }}
        />
      </td>
    </tr>
  );
}

async function saveField(
  assessmentId: string,
  reqId: string,
  patch: Record<string, string | null>,
): Promise<void> {
  const res = await fetch(
    `/api/assessments/${assessmentId}/requirements/${reqId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Save failed (${res.status})`);
  }
}

function EditableSelect({
  value,
  options,
  onSave,
}: {
  value: string;
  options: string[];
  onSave: (next: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Build a list that includes the current value if it's not in our preset
  const allOptions = useMemo(() => {
    if (value && !options.includes(value)) return [...options, value];
    return options;
  }, [value, options]);

  return (
    <div>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          startTransition(() => {
            onSave(next).catch((err: Error) => setError(err.message));
          });
        }}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
      >
        <option value="">— select —</option>
        {allOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}

function EditableTextarea({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function commit(): void {
    if (draft === value) return;
    setError(null);
    startTransition(() => {
      onSave(draft)
        .then(() => setSavedAt(Date.now()))
        .catch((err: Error) => setError(err.message));
    });
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        disabled={pending}
        rows={Math.max(1, Math.min(4, draft.split("\n").length))}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs disabled:opacity-50 resize-y"
      />
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      {savedAt && !error && !pending && (
        <div className="text-[10px] text-green-700 mt-0.5">saved</div>
      )}
    </div>
  );
}

function AiAnalysisBanner({ assessmentId }: { assessmentId: string }) {
  const [isRunning, setIsRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState({ input: 0, output: 0 });

  async function runOneBatch(): Promise<{ ok: boolean; remaining: number }> {
    const res = await fetch(`/api/assessments/${assessmentId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 30 }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      processed?: number;
      remaining?: number;
      error?: string;
      usage?: { inputTokens: number; outputTokens: number };
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setProcessed((p) => p + (data.processed ?? 0));
    setRemaining(data.remaining ?? 0);
    if (data.usage) {
      setTokens((t) => ({
        input: t.input + data.usage!.inputTokens,
        output: t.output + data.usage!.outputTokens,
      }));
    }
    return { ok: true, remaining: data.remaining ?? 0 };
  }

  async function runAll(): Promise<void> {
    setIsRunning(true);
    setError(null);
    setProcessed(0);
    setTokens({ input: 0, output: 0 });
    try {
      let safety = 50; // max iterations
      while (safety-- > 0) {
        const r = await runOneBatch();
        if (r.remaining === 0) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium text-blue-900">AI Analysis (Path A automation)</div>
          <div className="text-xs text-blue-800 mt-0.5">
            Auto-classify requirements with no Solution Provider Response yet
            against the 2602 inventory. Uses Claude Haiku 4.5; ~$0.80 for full
            Bursa-scale 778-req run. Refresh after to see results.
          </div>
          {processed > 0 && (
            <div className="text-xs text-blue-700 mt-1">
              Processed: <strong>{processed}</strong>
              {remaining !== null && <> · Remaining: <strong>{remaining}</strong></>}
              {tokens.input > 0 && (
                <> · Tokens: {tokens.input.toLocaleString()} in / {tokens.output.toLocaleString()} out</>
              )}
            </div>
          )}
          {error && (
            <div className="text-xs text-red-700 mt-1">Error: {error}</div>
          )}
        </div>
        <button
          type="button"
          onClick={runAll}
          disabled={isRunning}
          className="text-sm px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 shrink-0"
        >
          {isRunning ? "Analyzing…" : "Run AI Analysis"}
        </button>
      </div>
    </div>
  );
}

