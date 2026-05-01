"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, FileSpreadsheet, Archive, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatNumber } from "@/lib/format/number";

interface ReportSummary {
  assessment: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
    updatedAt: Date;
  };
  scope: { total: number; selected: number; maybe: number };
  steps: {
    total: number; reviewed: number; pending: number;
    fit: number; configure: number; gap: number; na: number; fitPercent: number;
  };
  gaps: {
    total: number; resolved: number; pending: number;
    totalEffortDays: number; byType: Record<string, number>;
  };
  config: { total: number };
}

interface SignOff {
  signatoryName: string;
  signatoryEmail: string;
  signatoryRole: string;
  signedAt: string;
}

interface ReportClientProps {
  assessmentId: string;
  companyName: string;
  status: string;
  summary: ReportSummary;
  signOffs: SignOff[];
}

// Order matches the v1.2 spec §3 inventory — Findings + Traceability are the
// new client-facing centerpieces (the "we heard you" deliverables) and slot in
// directly after the executive trio.
const REPORTS = [
  { key: "executive-summary", label: "Executive Summary", format: "PDF", icon: FileText, description: "One-page overview with scope, fit rate, gaps, and effort" },
  { key: "effort-estimate", label: "Effort Estimate", format: "PDF", icon: FileText, description: "Effort breakdown by phase and resolution type" },
  { key: "readiness-scorecard", label: "Readiness Scorecard", format: "PDF", icon: FileText, description: "GO / CONDITIONAL / NO-GO recommendation with per-category breakdown" },
  { key: "requirements-findings", label: "Requirements Findings", format: "PDF", icon: FileText, description: "Every requirement you submitted, in plain English — the client-facing centerpiece" },
  { key: "traceability-matrix", label: "Requirements Traceability Matrix", format: "XLSX", icon: FileSpreadsheet, description: "One row per requirement with source-file traceability and outcome" },
  { key: "scope-catalog", label: "Scope Catalog", format: "XLSX", icon: FileSpreadsheet, description: "All scope items with selection status and notes" },
  { key: "step-detail", label: "Process Step Detail", format: "XLSX", icon: FileSpreadsheet, description: "Every reviewed step with client responses" },
  { key: "gap-register", label: "Gap Register", format: "XLSX", icon: FileSpreadsheet, description: "All gaps with resolution details and effort" },
  { key: "config-workbook", label: "Configuration Workbook", format: "XLSX", icon: FileSpreadsheet, description: "Config activities with include/exclude decisions" },
  { key: "integration-register", label: "Integration Register", format: "XLSX", icon: FileSpreadsheet, description: "All integration points with direction, type, and effort" },
  { key: "dm-register", label: "Data Migration Register", format: "XLSX", icon: FileSpreadsheet, description: "Migration objects with approach, complexity, and status" },
  { key: "ocm-report", label: "OCM Impact Report", format: "XLSX", icon: FileSpreadsheet, description: "Change impacts with severity, training, and mitigation" },
  { key: "flow-atlas", label: "Process Flow Atlas", format: "PDF", icon: FileText, description: "All flow diagrams compiled in a single PDF" },
  { key: "audit-trail", label: "Decision Audit Trail", format: "XLSX", icon: FileSpreadsheet, description: "Complete chronological decision log" },
  { key: "remaining-register", label: "Remaining Items Register", format: "XLSX", icon: FileSpreadsheet, description: "Unresolved items requiring post-assessment action" },
  { key: "sap-best-practice-classification", label: "SAP Best-Practice Classification", format: "PDF", icon: FileText, description: "Aptus's independent O/C/G verdict per 2602 — dedicated Gap section" },
  { key: "sap-best-practice-classification?format=xlsx", label: "SAP Best-Practice Classification", format: "XLSX", icon: FileSpreadsheet, description: "Same independent verdict — multi-sheet workbook (O / C / G / N/A / Pending)" },
  { key: "sign-off", label: "Sign-Off", format: "PDF", icon: FileText, description: "Two-up signature page with bundle SHA-256 hash for tamper detection" },
] as const;

const SIGNOFF_ROLES = [
  { role: "client_representative", label: "Client Representative" },
  { role: "abeam_consultant", label: "Aptus Consultant" },
  { role: "abeam_pm", label: "Aptus PM" },
] as const;

export function ReportClient({
  assessmentId,
  companyName,
  status,
  summary,
  signOffs: initialSignOffs,
}: ReportClientProps) {
  const [signOffs, setSignOffs] = useState(initialSignOffs);
  const [signingRole, setSigningRole] = useState<string | null>(null);
  const [signForm, setSignForm] = useState({ name: "", email: "" });

  const canGenerate = status === "completed" || status === "reviewed" || status === "signed_off";
  const canSignOff = status === "reviewed" || status === "completed";

  const handleDownload = (reportKey: string) => {
    window.open(`/api/assessments/${assessmentId}/report/${reportKey}`, "_blank");
  };

  const handleSignOff = async (role: string) => {
    if (!signForm.name || !signForm.email) return;

    const res = await fetch(`/api/assessments/${assessmentId}/report/sign-off`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signatoryName: signForm.name,
        signatoryEmail: signForm.email,
        signatoryRole: role,
        acknowledgement: true,
      }),
    });

    if (res.ok) {
      const data = await res.json() as { signedAt: string; signatoryName: string; signatoryEmail: string; signatoryRole: string };
      setSignOffs((prev) => [...prev, {
        signatoryName: data.signatoryName,
        signatoryEmail: data.signatoryEmail,
        signatoryRole: data.signatoryRole,
        signedAt: data.signedAt,
      }]);
      setSigningRole(null);
      setSignForm({ name: "", email: "" });
    }
  };

  const signedRoles = new Set(signOffs.map((s) => s.signatoryRole));

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Assessment Report"
        description={`${companyName} — SAP Fit Assessment`}
      />

      {/* Summary overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Scope Items" value={`${summary.scope.selected}/${summary.scope.total}`} />
        <StatCard label="Fit Rate" value={`${summary.steps.fitPercent}%`} highlight />
        <StatCard label="Steps Reviewed" value={`${summary.steps.reviewed}/${summary.steps.total}`} />
        <StatCard label="Gaps" value={summary.gaps.total} />
        <StatCard label="Effort (days)" value={summary.gaps.totalEffortDays} />
      </div>

      {/* Fit breakdown */}
      <div className="bg-card rounded-lg border p-6 mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Fit Distribution</h3>
        <div className="flex gap-1 h-6 rounded-full overflow-hidden bg-muted">
          {summary.steps.total > 0 && (
            <>
              <div className="bg-green-500" style={{ width: `${(summary.steps.fit / summary.steps.total) * 100}%` }} title={`FIT: ${summary.steps.fit}`} />
              <div className="bg-blue-500" style={{ width: `${(summary.steps.configure / summary.steps.total) * 100}%` }} title={`CONFIGURE: ${summary.steps.configure}`} />
              <div className="bg-amber-500" style={{ width: `${(summary.steps.gap / summary.steps.total) * 100}%` }} title={`GAP: ${summary.steps.gap}`} />
              <div className="bg-slate-400" style={{ width: `${(summary.steps.na / summary.steps.total) * 100}%` }} title={`N/A: ${summary.steps.na}`} />
            </>
          )}
        </div>
        <div className="flex gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> FIT: {summary.steps.fit}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> CONFIGURE: {summary.steps.configure}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> GAP: {summary.steps.gap}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> N/A: {summary.steps.na}</span>
        </div>
      </div>

      {/* Downloads */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Report Downloads</h3>
        {!canGenerate && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-700">
            Reports are available when the assessment is completed, reviewed, or signed off.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORTS.map((report) => {
            const Icon = report.icon;
            const isAuditTrail = report.key === "audit-trail";
            const enabled = canGenerate || isAuditTrail;
            return (
              <div
                key={report.key}
                className={`flex items-center justify-between bg-card border rounded-lg px-4 py-3 ${enabled ? "" : "opacity-50"}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-muted-foreground/60" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{report.label}</p>
                    <p className="text-xs text-muted-foreground">{report.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{report.format}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!enabled}
                    onClick={() => handleDownload(report.key)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Complete package download */}
      <div className="bg-primary text-primary-foreground rounded-lg p-6 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Archive className="w-6 h-6 text-primary-foreground/60" />
          <div>
            <p className="font-medium">Complete Blueprint Package</p>
            <p className="text-sm text-primary-foreground/60">All reports combined in a single ZIP download</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
          disabled={!canGenerate}
          onClick={() => handleDownload("complete-package")}
        >
          <Download className="w-4 h-4 mr-1.5" />
          Download All
        </Button>
      </div>

      {/* Sign-off section */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Digital Sign-Off</h3>
        <div className="grid grid-cols-3 gap-4">
          {SIGNOFF_ROLES.map(({ role, label }) => {
            const signOff = signOffs.find((s) => s.signatoryRole === role);
            const isSigning = signingRole === role;

            return (
              <div key={role} className="bg-card border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  {signOff ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-muted-foreground/60" />
                  )}
                  <span className="text-sm font-medium">{label}</span>
                </div>

                {signOff ? (
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{signOff.signatoryName}</p>
                    <p>{signOff.signatoryEmail}</p>
                    <p className="mt-1">{new Date(signOff.signedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
                  </div>
                ) : isSigning ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={signForm.name}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={signForm.email}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSignOff(role)} disabled={!signForm.name || !signForm.email}>
                        Sign
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSigningRole(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <GatedButton
                    size="sm"
                    variant="outline"
                    gated={!canSignOff}
                    gatedReason="Sign-off becomes available once the assessment is reviewed or completed."
                    disabled={signedRoles.has(role)}
                    onClick={() => setSigningRole(role)}
                  >
                    Sign Off
                  </GatedButton>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-border">
        <Link href={`/assessment/${assessmentId}/config`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Configuration Matrix
          </Button>
        </Link>
        <div className="flex gap-3">
          <Link href={`/assessment/${assessmentId}/flows`}>
            <Button variant="outline">Flow Diagrams</Button>
          </Link>
          <Link href={`/assessment/${assessmentId}/remaining`}>
            <Button variant="outline">Remaining Items</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean | undefined }) {
  const display = typeof value === "number" ? formatNumber(value) : value;
  return (
    <div className="bg-card rounded-lg border p-4 text-center">
      <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? "text-green-600" : "text-foreground"}`}>{display}</p>
    </div>
  );
}
