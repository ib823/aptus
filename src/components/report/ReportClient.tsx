"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, FileSpreadsheet, Archive, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";

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

const REPORTS = [
  { key: "executive-summary", label: "Executive Summary", format: "PDF", icon: FileText, description: "One-page overview with scope, fit rate, gaps, and effort" },
  { key: "scope-catalog", label: "Scope Catalog", format: "XLSX", icon: FileSpreadsheet, description: "All scope items with selection status and notes" },
  { key: "step-detail", label: "Process Step Detail", format: "XLSX", icon: FileSpreadsheet, description: "Every reviewed step with client responses" },
  { key: "gap-register", label: "Gap Register", format: "XLSX", icon: FileSpreadsheet, description: "All gaps with resolution details and effort" },
  { key: "config-workbook", label: "Configuration Workbook", format: "XLSX", icon: FileSpreadsheet, description: "Config activities with include/exclude decisions" },
  { key: "effort-estimate", label: "Effort Estimate", format: "PDF", icon: FileText, description: "Effort breakdown by phase and resolution type" },
  { key: "audit-trail", label: "Decision Audit Trail", format: "XLSX", icon: FileSpreadsheet, description: "Complete chronological decision log" },
  { key: "flow-atlas", label: "Process Flow Atlas", format: "PDF", icon: FileText, description: "All flow diagrams compiled in a single PDF" },
  { key: "remaining-register", label: "Remaining Items Register", format: "XLSX", icon: FileSpreadsheet, description: "Unresolved items requiring post-assessment action" },
] as const;

const SIGNOFF_ROLES = [
  { role: "client_representative", label: "Client Representative" },
  { role: "bound_consultant", label: "Aptus Consultant" },
  { role: "bound_pm", label: "Aptus PM" },
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
        description={`${companyName} — SAP S/4HANA Cloud Fit Assessment`}
      />

      {/* Summary overview */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Scope Items" value={`${summary.scope.selected}/${summary.scope.total}`} />
        <StatCard label="Fit Rate" value={`${summary.steps.fitPercent}%`} highlight />
        <StatCard label="Steps Reviewed" value={`${summary.steps.reviewed}/${summary.steps.total}`} />
        <StatCard label="Gaps" value={String(summary.gaps.total)} />
        <StatCard label="Effort (days)" value={String(summary.gaps.totalEffortDays)} />
      </div>

      {/* Fit breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Fit Distribution</h3>
        <div className="flex gap-1 h-6 rounded-full overflow-hidden bg-gray-100">
          {summary.steps.total > 0 && (
            <>
              <div className="bg-green-500" style={{ width: `${(summary.steps.fit / summary.steps.total) * 100}%` }} title={`FIT: ${summary.steps.fit}`} />
              <div className="bg-blue-500" style={{ width: `${(summary.steps.configure / summary.steps.total) * 100}%` }} title={`CONFIGURE: ${summary.steps.configure}`} />
              <div className="bg-amber-500" style={{ width: `${(summary.steps.gap / summary.steps.total) * 100}%` }} title={`GAP: ${summary.steps.gap}`} />
              <div className="bg-gray-400" style={{ width: `${(summary.steps.na / summary.steps.total) * 100}%` }} title={`N/A: ${summary.steps.na}`} />
            </>
          )}
        </div>
        <div className="flex gap-6 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> FIT: {summary.steps.fit}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> CONFIGURE: {summary.steps.configure}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> GAP: {summary.steps.gap}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> N/A: {summary.steps.na}</span>
        </div>
      </div>

      {/* Downloads */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Report Downloads</h3>
        {!canGenerate && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-700">
            Reports are available when the assessment is completed, reviewed, or signed off.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3">
          {REPORTS.map((report) => {
            const Icon = report.icon;
            const isAuditTrail = report.key === "audit-trail";
            const enabled = canGenerate || isAuditTrail;
            return (
              <div
                key={report.key}
                className={`flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 ${enabled ? "" : "opacity-50"}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{report.label}</p>
                    <p className="text-xs text-gray-500">{report.description}</p>
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
      <div className="bg-gray-950 text-white rounded-lg p-6 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Archive className="w-6 h-6 text-gray-400" />
          <div>
            <p className="font-medium">Complete Blueprint Package</p>
            <p className="text-sm text-gray-400">All reports combined in a single ZIP download</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="border-gray-600 text-white hover:bg-gray-800"
          disabled={!canGenerate}
          onClick={() => {
            // Download all reports individually (ZIP generation would require server-side packaging)
            for (const report of REPORTS) {
              if (report.key !== "audit-trail") {
                handleDownload(report.key);
              }
            }
          }}
        >
          <Download className="w-4 h-4 mr-1.5" />
          Download All
        </Button>
      </div>

      {/* Sign-off section */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Digital Sign-Off</h3>
        <div className="grid grid-cols-3 gap-4">
          {SIGNOFF_ROLES.map(({ role, label }) => {
            const signOff = signOffs.find((s) => s.signatoryRole === role);
            const isSigning = signingRole === role;

            return (
              <div key={role} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  {signOff ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-gray-300" />
                  )}
                  <span className="text-sm font-medium">{label}</span>
                </div>

                {signOff ? (
                  <div className="text-xs text-gray-500">
                    <p className="font-medium text-gray-700">{signOff.signatoryName}</p>
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
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={signForm.email}
                      onChange={(e) => setSignForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canSignOff || signedRoles.has(role)}
                    onClick={() => setSigningRole(role)}
                  >
                    Sign Off
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
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

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean | undefined }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? "text-green-600" : "text-gray-950"}`}>{value}</p>
    </div>
  );
}
