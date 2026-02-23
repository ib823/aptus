"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2 } from "lucide-react";

interface SampleAssessmentBannerProps {
  assessmentId: string;
  onDelete: () => void;
}

export function SampleAssessmentBanner({ assessmentId, onDelete }: SampleAssessmentBannerProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete();
        router.push("/dashboard");
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-100">
            Sample Data
          </Badge>
          <span className="text-sm text-amber-800">
            This is a demo assessment with sample data. Changes here won&apos;t affect real assessments.
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={isDeleting}
        className="border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0"
      >
        <Trash2 className="h-4 w-4 mr-1" />
        {isDeleting ? "Deleting..." : "Delete Sample"}
      </Button>
    </div>
  );
}
