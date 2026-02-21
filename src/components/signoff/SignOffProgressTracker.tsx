"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SignOffStatus } from "@/types/signoff";
import { SIGNOFF_STATUS_LABELS } from "@/types/signoff";

interface SignOffProgressTrackerProps {
  currentStatus: SignOffStatus;
  className?: string | undefined;
}

interface StepInfo {
  label: string;
  statuses: SignOffStatus[];
}

const STEPS: StepInfo[] = [
  {
    label: "Area Validation",
    statuses: ["AREA_VALIDATION_IN_PROGRESS", "AREA_VALIDATION_COMPLETE"],
  },
  {
    label: "Technical Validation",
    statuses: ["TECHNICAL_VALIDATION_IN_PROGRESS", "TECHNICAL_VALIDATION_COMPLETE"],
  },
  {
    label: "Cross-Functional Review",
    statuses: ["CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS", "CROSS_FUNCTIONAL_VALIDATION_COMPLETE"],
  },
  {
    label: "Executive Sign-Off",
    statuses: ["EXECUTIVE_SIGN_OFF_PENDING", "EXECUTIVE_SIGNED"],
  },
  {
    label: "Partner Countersign",
    statuses: ["PARTNER_COUNTERSIGN_PENDING", "COMPLETED"],
  },
];

function getStepState(
  step: StepInfo,
  currentStatus: SignOffStatus,
): "completed" | "active" | "pending" | "rejected" {
  if (currentStatus === "REJECTED") return "rejected";
  if (currentStatus === "COMPLETED") return "completed";

  const allStatuses: SignOffStatus[] = [
    "VALIDATION_NOT_STARTED",
    "AREA_VALIDATION_IN_PROGRESS",
    "AREA_VALIDATION_COMPLETE",
    "TECHNICAL_VALIDATION_IN_PROGRESS",
    "TECHNICAL_VALIDATION_COMPLETE",
    "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS",
    "CROSS_FUNCTIONAL_VALIDATION_COMPLETE",
    "EXECUTIVE_SIGN_OFF_PENDING",
    "EXECUTIVE_SIGNED",
    "PARTNER_COUNTERSIGN_PENDING",
    "COMPLETED",
  ];

  const currentIdx = allStatuses.indexOf(currentStatus);
  const stepStartIdx = allStatuses.indexOf(step.statuses[0] ?? "VALIDATION_NOT_STARTED");
  const stepEndIdx = allStatuses.indexOf(step.statuses[step.statuses.length - 1] ?? "VALIDATION_NOT_STARTED");

  if (currentIdx > stepEndIdx) return "completed";
  if (currentIdx >= stepStartIdx && currentIdx <= stepEndIdx) return "active";
  return "pending";
}

export function SignOffProgressTracker({ currentStatus, className }: SignOffProgressTrackerProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="mb-2 text-sm font-medium text-muted-foreground">
        Status: {SIGNOFF_STATUS_LABELS[currentStatus] ?? currentStatus}
      </div>
      <div className="flex flex-col gap-3">
        {STEPS.map((step, index) => {
          const state = getStepState(step, currentStatus);
          return (
            <div key={step.label} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  state === "completed" && "bg-green-600 text-white",
                  state === "active" && "bg-blue-600 text-white",
                  state === "pending" && "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
                  state === "rejected" && "bg-red-600 text-white",
                )}
              >
                {state === "completed" ? "\u2713" : index + 1}
              </div>
              <div className="flex-1">
                <span
                  className={cn(
                    "text-sm font-medium",
                    state === "active" && "text-blue-700 dark:text-blue-300",
                    state === "completed" && "text-green-700 dark:text-green-300",
                    state === "pending" && "text-muted-foreground",
                    state === "rejected" && "text-red-700 dark:text-red-300",
                  )}
                >
                  {step.label}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs border-transparent",
                  state === "completed" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
                  state === "active" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
                  state === "pending" && "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                  state === "rejected" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                )}
              >
                {state === "completed" ? "Done" : state === "active" ? "In Progress" : state === "rejected" ? "Rejected" : "Pending"}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
