"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AssessmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
      <h2 className="text-xl font-semibold text-gray-950 mb-2">Assessment Error</h2>
      <p className="text-base text-gray-600 mb-6 max-w-md">
        {error.message || "Failed to load assessment data. Please try again."}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline">
          Try Again
        </Button>
        <Button onClick={() => (window.location.href = "/assessments")}>
          Back to Assessments
        </Button>
      </div>
    </div>
  );
}
