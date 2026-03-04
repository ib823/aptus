"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkshopStepCard } from "@/components/workshop/WorkshopStepCard";
import { WorkshopVotingPanel } from "@/components/workshop/WorkshopVotingPanel";
import { WorkshopAttendeeList } from "@/components/workshop/WorkshopAttendeeList";
import { WorkshopAgenda } from "@/components/workshop/WorkshopAgenda";
import { WorkshopNavigationBar } from "@/components/workshop/WorkshopNavigationBar";
import { WorkshopActionItemForm } from "@/components/workshop/WorkshopActionItemForm";
import { WorkshopActionItemList } from "@/components/workshop/WorkshopActionItemList";
import { WorkshopMinutesViewer } from "@/components/workshop/WorkshopMinutesViewer";
import { PresenceAvatars } from "@/components/collaboration/PresenceAvatars";
import type { AgendaItem } from "@/types/workshop";

interface StepInfo {
  id: string;
  sequence: number;
  actionTitle: string;
  scopeItemId: string;
  processFlowName?: string | undefined;
  scopeItemName?: string | undefined;
  fitStatus?: string | undefined;
}

interface AttendeeInfo {
  id: string;
  name: string;
  role: string;
  connectionStatus: string;
  isPresenter: boolean;
}

interface ActionItemInfo {
  id: string;
  title: string;
  description?: string | null | undefined;
  assignedToName?: string | null | undefined;
  status: string;
  priority: string;
  dueDate?: string | null | undefined;
}

interface WorkshopModeLayoutProps {
  assessmentId: string;
  sessionId: string;
  sessionTitle: string;
  sessionCode: string;
  sessionStatus: string;
  isFacilitator: boolean;
  steps: StepInfo[];
  agenda: AgendaItem[];
  initialAttendees: AttendeeInfo[];
  initialActionItems: ActionItemInfo[];
}

const POLL_INTERVAL = 5000; // 5 seconds

export function WorkshopModeLayout({
  assessmentId,
  sessionId,
  sessionTitle,
  sessionCode,
  sessionStatus,
  isFacilitator,
  steps,
  agenda,
  initialAttendees,
  initialActionItems,
}: WorkshopModeLayoutProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState(sessionStatus);
  const [attendees, setAttendees] = useState(initialAttendees);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const { theme, setTheme } = useTheme();

  const currentStep = steps[currentIndex];

  // Poll for attendee updates and navigation
  useEffect(() => {
    if (status !== "in_progress") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/assessments/${assessmentId}/workshops/${sessionId}/attendees`,
        );
        if (res.ok) {
          const json = await res.json() as { data: AttendeeInfo[] };
          setAttendees(json.data);
        }
      } catch {
        // silently fail
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [assessmentId, sessionId, status]);

  const handleStart = useCallback(async () => {
    const res = await fetch(
      `/api/assessments/${assessmentId}/workshops/${sessionId}/start`,
      { method: "POST" },
    );
    if (res.ok) {
      setStatus("in_progress");
    }
  }, [assessmentId, sessionId]);

  const handleEnd = useCallback(async () => {
    const res = await fetch(
      `/api/assessments/${assessmentId}/workshops/${sessionId}/end`,
      { method: "POST" },
    );
    if (res.ok) {
      setStatus("completed");
    }
  }, [assessmentId, sessionId]);

  const handleNavigate = useCallback(async (idx: number) => {
    setCurrentIndex(idx);
    const step = steps[idx];
    if (step && isFacilitator) {
      await fetch(
        `/api/assessments/${assessmentId}/workshops/${sessionId}/navigate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentStepId: step.id,
            currentScopeItemId: step.scopeItemId,
          }),
        },
      );
    }
  }, [assessmentId, sessionId, steps, isFacilitator]);

  const refreshActionItems = useCallback(async () => {
    const res = await fetch(
      `/api/assessments/${assessmentId}/workshops/${sessionId}/action-items`,
    );
    if (res.ok) {
      const json = await res.json() as { data: ActionItemInfo[] };
      setActionItems(json.data);
    }
  }, [assessmentId, sessionId]);

  const handleActionItemStatusChange = useCallback(async (itemId: string, newStatus: string) => {
    await fetch(
      `/api/assessments/${assessmentId}/workshops/${sessionId}/action-items/${itemId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      },
    );
    await refreshActionItems();
  }, [assessmentId, sessionId, refreshActionItems]);

  return (
    <div className="min-h-screen bg-background text-foreground dark:bg-slate-900 dark:text-white">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between dark:border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-foreground dark:text-white">
            {sessionTitle}
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground dark:text-slate-400">
              Code: <span className="font-mono font-bold">{sessionCode}</span>
            </span>
            <Badge variant="outline" className={
              status === "in_progress"
                ? "bg-green-50 text-green-700"
                : status === "completed"
                  ? "bg-slate-50 text-slate-500"
                  : "bg-blue-50 text-blue-700"
            }>
              {status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PresenceAvatars assessmentId={assessmentId} />
          <div className="h-6 w-px bg-border mx-2" />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? "Light" : "Dark"}
            </Button>
            {isFacilitator && status === "scheduled" && (
              <Button size="sm" onClick={() => void handleStart()}>Start Workshop</Button>
            )}
            {isFacilitator && status === "in_progress" && (
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => void handleEnd()}>
                End Workshop
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-4 p-4 max-w-7xl mx-auto">
        {/* Left sidebar */}
        <div className="hidden lg:block w-64 shrink-0 space-y-4">
          <WorkshopAttendeeList attendees={attendees} />
          <WorkshopAgenda items={agenda} currentIndex={currentIndex} />
        </div>

        {/* Center area */}
        <div className="flex-1 min-w-0 space-y-4">
          {currentStep ? (
            <>
              <WorkshopStepCard
                stepTitle={currentStep.actionTitle}
                stepSequence={currentStep.sequence}
                scopeItemName={currentStep.scopeItemName}
                processFlowName={currentStep.processFlowName}
                currentStatus={currentStep.fitStatus}
              />

              {status === "in_progress" && (
                <WorkshopVotingPanel
                  assessmentId={assessmentId}
                  sessionId={sessionId}
                  processStepId={currentStep.id}
                />
              )}

              <WorkshopNavigationBar
                currentIndex={currentIndex}
                totalSteps={steps.length}
                onPrevious={() => void handleNavigate(currentIndex - 1)}
                onNext={() => void handleNavigate(currentIndex + 1)}
                disabled={status !== "in_progress"}
              />
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground dark:text-slate-400">
              No steps to review in this workshop.
            </div>
          )}

          {/* Minutes viewer for completed workshops */}
          {status === "completed" && (
            <WorkshopMinutesViewer
              assessmentId={assessmentId}
              sessionId={sessionId}
              isFacilitator={isFacilitator}
            />
          )}
        </div>

        {/* Right sidebar */}
        <div className="hidden lg:block w-72 shrink-0 space-y-4">
          {status === "in_progress" && currentStep && (
            <WorkshopActionItemForm
              assessmentId={assessmentId}
              sessionId={sessionId}
              relatedStepId={currentStep.id}
              relatedScopeItemId={currentStep.scopeItemId}
              onCreated={() => void refreshActionItems()}
            />
          )}
          <WorkshopActionItemList
            items={actionItems}
            onStatusChange={status === "in_progress" ? handleActionItemStatusChange : undefined}
          />
        </div>
      </div>
    </div>
  );
}