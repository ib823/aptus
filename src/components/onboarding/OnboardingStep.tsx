"use client";

import { ArrowRight, User, Users, FileText, Search, MousePointer } from "lucide-react";
import type { OnboardingStepConfig, OnboardingAction } from "@/types/onboarding";

interface OnboardingStepProps {
  step: OnboardingStepConfig;
}

function ActionIcon({ action }: { action: OnboardingAction }) {
  switch (action.type) {
    case "navigate":
      return <ArrowRight className="h-5 w-5 text-blue-500" />;
    case "complete_profile":
      return <User className="h-5 w-5 text-green-500" />;
    case "invite_team":
      return <Users className="h-5 w-5 text-purple-500" />;
    case "create_assessment":
      return <FileText className="h-5 w-5 text-amber-500" />;
    case "review_scope":
      return <Search className="h-5 w-5 text-blue-500" />;
    case "highlight":
      return <MousePointer className="h-5 w-5 text-blue-500" />;
    default:
      return null;
  }
}

export function OnboardingStep({ step }: OnboardingStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <ActionIcon action={step.action} />
        </div>
        <div>
          <p className="text-sm text-foreground">{step.description}</p>
          {step.estimatedMinutes && (
            <p className="text-xs text-muted-foreground mt-1">
              Estimated time: {step.estimatedMinutes} min
            </p>
          )}
          {step.isRequired && (
            <span className="inline-block text-xs text-red-500 font-medium mt-1">Required</span>
          )}
        </div>
      </div>
    </div>
  );
}
