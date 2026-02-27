"use client";

import { useState, memo } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Clock, Layers, CheckSquare, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { UI_TEXT } from "@/constants/ui-text";
import { getScopeBriefing } from "@/constants/scope-briefings";
import { SCOPE_BUSINESS_SUMMARIES } from "@/constants/scope-summaries";
import { extractScopeSummary } from "@/lib/assessment/scope-summary";

// --- Types ---

interface ProcessAreaInfo {
  name: string;
  stepCount: number;
  classifiableCount: number;
}

interface ScopeItemBriefingProps {
  scopeItemId: string;
  scopeItemName: string;
  purposeHtml?: string | undefined;
  processAreas: ProcessAreaInfo[];
  totalClassifiable: number;
  totalSteps: number;
  isSelected: boolean;
  isLoading: boolean;
  onStartReview: () => void;
  onBack: () => void;
  onToggleSelection: () => void;
}

// --- Component ---

export const ScopeItemBriefing = memo(function ScopeItemBriefing({
  scopeItemId,
  scopeItemName,
  purposeHtml,
  processAreas,
  totalClassifiable,
  totalSteps,
  isSelected,
  isLoading,
  onStartReview,
  onBack,
  onToggleSelection,
}: ScopeItemBriefingProps) {
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const briefing = getScopeBriefing(scopeItemId);
  const businessSummary = SCOPE_BUSINESS_SUMMARIES[scopeItemId];

  // Estimate review time: ~2 min per classifiable step
  const estimatedMinutes = totalClassifiable > 0 ? Math.max(5, Math.round(totalClassifiable * 2)) : null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {UI_TEXT.scope.briefingBack}
      </button>

      {/* 1. Header card */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm font-mono px-2 py-0.5">
                {scopeItemId}
              </Badge>
              <CardTitle className="text-xl">{scopeItemName}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isSelected}
                onCheckedChange={onToggleSelection}
                aria-label={`Include ${scopeItemName} in scope`}
              />
              <span className="text-xs text-muted-foreground">
                {isSelected ? "In scope" : "Not in scope"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="w-4 h-4 shrink-0" />
              <span>{totalSteps} total steps</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckSquare className="w-4 h-4 shrink-0" />
              <span>{totalClassifiable} to review</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>{processAreas.length} process areas</span>
            </div>
            {estimatedMinutes && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 shrink-0" />
                <span>~{estimatedMinutes} min review</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. What This Covers */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">{UI_TEXT.scope.briefingWhatCovers}</CardTitle>
        </CardHeader>
        <CardContent>
          {briefing ? (
            <div className="space-y-4">
              {briefing.sections.map((section, idx) => (
                <div key={idx}>
                  <h4 className="text-sm font-semibold text-foreground mb-1">
                    {section.heading}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {businessSummary && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {businessSummary}
                </p>
              )}
              {purposeHtml && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {extractScopeSummary(purposeHtml, 400)}
                </p>
              )}
              {!businessSummary && !purposeHtml && (
                <p className="text-sm text-muted-foreground italic">
                  No detailed description available for this scope item.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. How the Review Is Structured */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">{UI_TEXT.scope.briefingHowStructured}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : processAreas.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {processAreas.map((area, idx) => (
                <div
                  key={area.name}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={area.name}>
                      {area.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {area.stepCount} steps ({area.classifiableCount} to review)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Process area information will be available once the hierarchy data loads.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4. Questions to Discuss (only if curated briefing has questions) */}
      {briefing && briefing.preReviewQuestions.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <button
              onClick={() => setQuestionsOpen(!questionsOpen)}
              className="flex items-center gap-2 w-full text-left"
            >
              {questionsOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <CardTitle className="text-base">
                {UI_TEXT.scope.briefingQuestions}
              </CardTitle>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {briefing.preReviewQuestions.length}
              </Badge>
            </button>
          </CardHeader>
          {questionsOpen && (
            <CardContent>
              <ul className="space-y-2">
                {briefing.preReviewQuestions.map((q, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="text-muted-foreground/50 shrink-0 mt-0.5">
                      {idx + 1}.
                    </span>
                    {q}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {/* 5. Action buttons */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
        {isSelected && (
          <Button onClick={onStartReview}>
            {UI_TEXT.scope.briefingStartReview}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
});
