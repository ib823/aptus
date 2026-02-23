"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { CardSkeleton } from "@/components/shared/LoadingSkeleton";
import type { OnboardingFlow } from "@/types/onboarding";

interface OnboardingState {
  flow: OnboardingFlow;
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  isComplete: boolean;
  isNew: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) {
          router.push("/dashboard");
          return;
        }
        const json = await res.json();
        const { progress, flow, isNew } = json.data;

        if (progress?.isComplete) {
          router.push("/dashboard");
          return;
        }

        setState({
          flow,
          currentStep: progress?.currentStep ?? 0,
          completedSteps: progress?.completedSteps ?? [],
          skippedSteps: progress?.skippedSteps ?? [],
          isComplete: false,
          isNew: isNew ?? !progress,
        });

        // Auto-start onboarding if new user
        if (!progress) {
          await fetch("/api/onboarding/start", { method: "POST" });
        }
      } catch {
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handleComplete = useCallback(
    async (stepIndex: number) => {
      if (actionLoading) return;
      setActionLoading(true);
      try {
        const res = await fetch("/api/onboarding/progress", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIndex, action: "complete" }),
        });
        if (!res.ok) return;
        const json = await res.json();
        const { progress, nextStep } = json.data;
        setState((prev) =>
          prev
            ? {
                ...prev,
                currentStep: nextStep ?? prev.currentStep,
                completedSteps: progress.completedSteps,
                skippedSteps: progress.skippedSteps,
              }
            : prev,
        );
      } finally {
        setActionLoading(false);
      }
    },
    [actionLoading],
  );

  const handleSkip = useCallback(
    async (stepIndex: number) => {
      if (actionLoading) return;
      setActionLoading(true);
      try {
        const res = await fetch("/api/onboarding/progress", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIndex, action: "skip" }),
        });
        if (!res.ok) return;
        const json = await res.json();
        const { progress, nextStep } = json.data;
        setState((prev) =>
          prev
            ? {
                ...prev,
                currentStep: nextStep ?? prev.currentStep,
                completedSteps: progress.completedSteps,
                skippedSteps: progress.skippedSteps,
              }
            : prev,
        );
      } finally {
        setActionLoading(false);
      }
    },
    [actionLoading],
  );

  const handleFinish = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      const redirectUrl = json.data?.redirectUrl ?? "/dashboard";
      router.push(redirectUrl);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, router]);

  if (loading || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-lg">
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <OnboardingWizard
      flow={state.flow}
      currentStep={state.currentStep}
      completedSteps={state.completedSteps}
      skippedSteps={state.skippedSteps}
      onComplete={handleComplete}
      onSkip={handleSkip}
      onFinish={handleFinish}
      isLoading={actionLoading}
    />
  );
}
