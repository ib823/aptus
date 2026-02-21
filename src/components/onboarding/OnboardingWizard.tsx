"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OnboardingStep } from "./OnboardingStep";
import { ProgressDots } from "./ProgressDots";
import type { OnboardingFlow } from "@/types/onboarding";
import { canSkipStep } from "@/lib/onboarding/flow-engine";

interface OnboardingWizardProps {
  flow: OnboardingFlow;
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  onComplete: (stepIndex: number) => void;
  onSkip: (stepIndex: number) => void;
  onFinish: () => void;
  isLoading?: boolean | undefined;
}

export function OnboardingWizard({
  flow,
  currentStep,
  completedSteps,
  skippedSteps,
  onComplete,
  onSkip,
  onFinish,
  isLoading,
}: OnboardingWizardProps) {
  const [activeStep, setActiveStep] = useState(currentStep);
  const step = flow.steps[activeStep];
  const isLastStep = activeStep === flow.steps.length - 1;
  const allRequiredDone = flow.steps
    .filter((s) => s.isRequired)
    .every((s) => completedSteps.includes(s.index));

  if (!step) return null;

  const handleComplete = () => {
    onComplete(activeStep);
    if (isLastStep) {
      if (allRequiredDone) {
        onFinish();
      }
    } else {
      setActiveStep((prev) => Math.min(prev + 1, flow.steps.length - 1));
    }
  };

  const handleSkip = () => {
    if (canSkipStep(step)) {
      onSkip(activeStep);
      if (!isLastStep) {
        setActiveStep((prev) => Math.min(prev + 1, flow.steps.length - 1));
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">{flow.title}</h1>
          <p className="text-muted-foreground mt-1">{flow.description}</p>
        </div>

        <ProgressDots
          total={flow.steps.length}
          current={activeStep}
          completed={completedSteps}
          skipped={skippedSteps}
        />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">
              Step {activeStep + 1}: {step.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OnboardingStep step={step} />

            <div className="flex items-center justify-between mt-6">
              <Button
                variant="ghost"
                onClick={() => setActiveStep((prev) => Math.max(prev - 1, 0))}
                disabled={activeStep === 0 || (isLoading ?? false)}
              >
                Back
              </Button>
              <div className="flex gap-2">
                {canSkipStep(step) && (
                  <Button
                    variant="outline"
                    onClick={handleSkip}
                    disabled={isLoading ?? false}
                  >
                    Skip
                  </Button>
                )}
                <Button
                  onClick={handleComplete}
                  disabled={isLoading ?? false}
                >
                  {isLastStep && allRequiredDone ? "Finish" : "Continue"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
