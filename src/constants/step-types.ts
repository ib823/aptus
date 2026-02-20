/** Step type labels and metadata */

import type { StepType } from "@/types/sap";

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  LOGON: "Log On",
  ACCESS_APP: "Access App",
  INFORMATION: "Information",
  DATA_ENTRY: "Data Entry",
  ACTION: "Action",
  VERIFICATION: "Verification",
  NAVIGATION: "Navigation",
  PROCESS_STEP: "Process Step",
};

export const STEP_TYPE_ICONS: Record<StepType, string> = {
  LOGON: "LogIn",
  ACCESS_APP: "AppWindow",
  INFORMATION: "Info",
  DATA_ENTRY: "PenLine",
  ACTION: "Play",
  VERIFICATION: "CheckCircle",
  NAVIGATION: "ArrowRight",
  PROCESS_STEP: "Workflow",
};

/** Step types that are typically repetitive and can be hidden */
export const REPETITIVE_STEP_TYPES: StepType[] = ["LOGON", "ACCESS_APP"];
