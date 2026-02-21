"use client";

import { Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ReportHistoryEntry {
  id: string;
  reportType: string;
  status: string;
  fileName?: string | null | undefined;
  fileSize?: number | null | undefined;
  fileUrl?: string | null | undefined;
  generatedAt: string;
}

interface ReportHistoryTableProps {
  reports: ReportHistoryEntry[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatReportType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  generating: "secondary",
  failed: "destructive",
};

export function ReportHistoryTable({ reports }: ReportHistoryTableProps) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No reports generated yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Report Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>File</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Generated</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="font-medium">
              {formatReportType(report.reportType)}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[report.status] ?? "outline"}>
                {report.status}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {report.fileName ?? "-"}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {report.fileSize != null ? formatFileSize(report.fileSize) : "-"}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatRelativeTime(report.generatedAt)}
            </TableCell>
            <TableCell className="text-right">
              {report.status === "completed" && report.fileUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(report.fileUrl!, "_blank")}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
