"use client";

/**
 * AptusAssessmentsList — App-4 redesign of the assessments list page.
 * Source: docs/design/v1.2/surfaces.jsx (the prototype's AssessmentsList).
 *
 * Layout per spec §8.4:
 *   - PageHeader (title + count + "New assessment" CTA)
 *   - Search input + status filter chips
 *   - Card with grid: Client / Status / Coverage / Last touched / Owner
 *   - Click a row → /assessment/{id}
 */

import { ArrowRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StatusPill } from "./StatusPill";

interface AssessmentRow {
  id: string;
  companyName: string;
  industry: string;
  country: string | null;
  status: string;
  updatedAt: string;
  _count: {
    scopeSelections: number;
    stepResponses: number;
    stakeholders: number;
  };
}

interface AptusAssessmentsListProps {
  assessments: AssessmentRow[];
  canCreate: boolean;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
  };
}

const STATUS_FILTERS = ["All", "Draft", "Active", "Done"] as const;

/** Coalesce a raw status string into a display tone. */
function statusTone(status: string): "info" | "neutral" | "success" | "warning" {
  const s = status.toLowerCase();
  if (s.includes("active") || s.includes("progress") || s.includes("review")) return "info";
  if (s.includes("done") || s.includes("complete") || s.includes("signed")) return "success";
  if (s.includes("draft")) return "neutral";
  return "warning";
}

function statusFilterMatches(filter: string, status: string): boolean {
  if (filter === "All") return true;
  const s = status.toLowerCase();
  switch (filter) {
    case "Draft":  return s.includes("draft");
    case "Active": return s.includes("active") || s.includes("progress") || s.includes("review");
    case "Done":   return s.includes("done") || s.includes("complete") || s.includes("signed");
    default:       return true;
  }
}

/** Format a date string as "12 Apr" / "today" / "2d ago". */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function AptusAssessmentsList({
  assessments,
  canCreate,
  pagination,
}: AptusAssessmentsListProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>("All");

  const filtered = useMemo(() => {
    return assessments.filter((a) => {
      if (!statusFilterMatches(statusFilter, a.status)) return false;
      if (query === "") return true;
      const q = query.toLowerCase();
      return (
        a.companyName.toLowerCase().includes(q) ||
        a.industry.toLowerCase().includes(q) ||
        (a.country?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [assessments, statusFilter, query]);

  const countriesCount = useMemo(
    () => new Set(assessments.map((a) => a.country).filter(Boolean)).size,
    [assessments],
  );

  // The portal layout already wraps everything in .aptus-app so the design
  // tokens are active. Render directly without a redundant wrapper.
  return (
    <div>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 className="a-h1" style={{ margin: 0 }}>Assessments</h1>
          <p className="a-small" style={{ marginTop: 4 }}>
            {pagination.totalCount} engagement{pagination.totalCount === 1 ? "" : "s"}
            {countriesCount > 0 && ` across ${countriesCount} countr${countriesCount === 1 ? "y" : "ies"}`}
          </p>
        </div>
        {canCreate && (
          <Link href="/assessments/new" className="a-btn a-btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={14} /> New assessment
          </Link>
        )}
      </header>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--aptus-text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            className="a-input"
            placeholder="Search assessments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`a-btn a-btn-sm ${statusFilter === f ? "a-btn-primary" : "a-btn-ghost"}`}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span className="a-small">
          Showing {filtered.length} of {assessments.length}
        </span>
      </div>

      {/* Table card */}
      <div className="a-card" style={{ padding: 0 }}>
        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1.5fr 1fr 1fr 60px",
            gap: 16,
            padding: "12px 16px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--aptus-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            borderBottom: "1px solid var(--aptus-border)",
          }}
        >
          <span>Client</span>
          <span>Status</span>
          <span>Reqs / Steps</span>
          <span>Last touched</span>
          <span>Members</span>
          <span />
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ padding: 64, textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                margin: "0 auto 12px",
                borderRadius: 999,
                background: "var(--aptus-surface-2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Search size={20} style={{ color: "var(--aptus-text-muted)" }} />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No matching assessments</div>
            <div className="a-small" style={{ marginBottom: 16 }}>
              {assessments.length === 0
                ? "You haven't created an assessment yet."
                : "Try a different search or status filter."}
            </div>
            {assessments.length > 0 ? (
              <button
                type="button"
                className="a-btn a-btn-secondary a-btn-sm"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("All");
                }}
              >
                Clear filters
              </button>
            ) : canCreate ? (
              <Link href="/assessments/new" className="a-btn a-btn-primary a-btn-sm" style={{ textDecoration: "none" }}>
                <Plus size={14} /> Create your first assessment
              </Link>
            ) : null}
          </div>
        )}

        {/* Rows */}
        {filtered.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => router.push(`/assessment/${a.id}`)}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1.5fr 1fr 1fr 60px",
              gap: 16,
              alignItems: "center",
              width: "100%",
              padding: "16px",
              borderTop: "0",
              borderBottom: "1px solid var(--aptus-border)",
              background: "var(--aptus-surface)",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              transition: "background 100ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--aptus-surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--aptus-surface)")}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.companyName}</div>
              <div className="a-small">
                {a.industry}
                {a.country && ` · ${a.country}`}
              </div>
            </div>
            <span>
              <StatusPill status={a.status} tone={statusTone(a.status)} />
            </span>
            <div className="a-small">
              {a._count.scopeSelections} scope · {a._count.stepResponses} steps reviewed
            </div>
            <span className="a-small">{formatRelative(a.updatedAt)}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: "var(--aptus-surface-2)",
                  color: "var(--aptus-text)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {a._count.stakeholders}
              </div>
              <span className="a-small">member{a._count.stakeholders === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
              <ArrowRight size={14} style={{ color: "var(--aptus-text-muted)" }} />
            </div>
          </button>
        ))}
      </div>

      {/* Pagination footer */}
      {pagination.totalCount > pagination.pageSize && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span className="a-small">
            Page {pagination.page} of {Math.ceil(pagination.totalCount / pagination.pageSize)}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {pagination.page > 1 && (
              <Link href={`/assessments?page=${pagination.page - 1}`} className="a-btn a-btn-secondary a-btn-sm" style={{ textDecoration: "none" }}>
                Previous
              </Link>
            )}
            {pagination.page < Math.ceil(pagination.totalCount / pagination.pageSize) && (
              <Link href={`/assessments?page=${pagination.page + 1}`} className="a-btn a-btn-secondary a-btn-sm" style={{ textDecoration: "none" }}>
                Next <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
