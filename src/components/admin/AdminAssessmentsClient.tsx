"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface AssessmentRow {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  companySize: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    scopeSelections: number;
    stepResponses: number;
    gapResolutions: number;
    stakeholders: number;
  };
}

interface AdminAssessmentsClientProps {
  assessments: AssessmentRow[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  reviewed: "bg-purple-100 text-purple-700",
  signed_off: "bg-emerald-100 text-emerald-700",
};

export function AdminAssessmentsClient({ assessments }: AdminAssessmentsClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return assessments;
    return assessments.filter((a) => a.status === statusFilter);
  }, [assessments, statusFilter]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-950 tracking-tight">All Assessments</h1>
          <p className="mt-1 text-base text-gray-600">View assessments across all clients</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="all">All Status ({assessments.length})</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="reviewed">Reviewed</option>
          <option value="signed_off">Signed Off</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
          No assessments found.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-500">Company</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Industry</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Scope</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Steps</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Gaps</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/assessment/${a.id}/scope`} className="text-blue-600 hover:underline font-medium">
                      {a.companyName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{a.industry}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? "bg-gray-100"}`}>
                      {a.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{a._count.scopeSelections}</td>
                  <td className="px-4 py-2.5 text-gray-600">{a._count.stepResponses}</td>
                  <td className="px-4 py-2.5 text-gray-600">{a._count.gapResolutions}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">{filtered.length} of {assessments.length} assessments</p>
    </div>
  );
}
