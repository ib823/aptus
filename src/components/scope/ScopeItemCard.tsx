"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { sanitizeHtmlContent } from "@/lib/security/sanitize";

interface ScopeItemData {
  id: string;
  nameClean: string;
  totalSteps: number;
  subArea: string;
  configCount: number;
  tutorialUrl: string | null;
  purposeHtml: string;
  overviewHtml: string;
  prerequisitesHtml: string;
  selected: boolean;
  relevance: string | null;
  currentState: string | null;
  notes: string | null;
}

interface ScopeItemCardProps {
  item: ScopeItemData;
  onSelectionChange: (itemId: string, data: {
    selected: boolean;
    relevance: string;
    currentState?: string | null;
    notes?: string | null;
  }) => void;
  isPreSelected?: boolean;
}

const RELEVANCE_OPTIONS = [
  { value: "YES", label: "Yes", style: "bg-green-100 text-green-700 border-green-300" },
  { value: "MAYBE", label: "Maybe", style: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "NO", label: "No", style: "bg-gray-100 text-gray-600 border-gray-300" },
] as const;

const CURRENT_STATE_OPTIONS = [
  { value: "MANUAL", label: "Manual Process" },
  { value: "SYSTEM", label: "Existing System" },
  { value: "OUTSOURCED", label: "Outsourced" },
  { value: "NA", label: "Not Applicable" },
] as const;

export function ScopeItemCard({ item, onSelectionChange, isPreSelected }: ScopeItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const relevance = item.relevance ?? "YES";

  const handleToggle = useCallback(() => {
    const newSelected = !item.selected;
    onSelectionChange(item.id, {
      selected: newSelected,
      relevance: newSelected ? "YES" : "NO",
      currentState: item.currentState,
      notes: item.notes,
    });
  }, [item, onSelectionChange]);

  const handleRelevanceChange = useCallback(
    (newRelevance: string) => {
      const selected = newRelevance !== "NO";
      onSelectionChange(item.id, {
        selected,
        relevance: newRelevance,
        currentState: item.currentState,
        notes: item.notes,
      });
    },
    [item, onSelectionChange],
  );

  const handleCurrentStateChange = useCallback(
    (value: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        currentState: value,
        notes: item.notes,
      });
    },
    [item, relevance, onSelectionChange],
  );

  const handleNotesChange = useCallback(
    (notes: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        currentState: item.currentState,
        notes: notes || null,
      });
    },
    [item, relevance, onSelectionChange],
  );

  return (
    <div className={`border-b border last:border-b-0 ${!item.selected && !isPreSelected ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 py-4 px-1">
        <Checkbox
          checked={item.selected}
          onCheckedChange={handleToggle}
          aria-label={`Select ${item.nameClean}`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground/60">{item.id}</span>
            <span className="text-base font-semibold text-foreground truncate">
              {item.nameClean}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-0.5 text-xs text-muted-foreground">
            <span>{item.totalSteps} process steps</span>
            <span>{item.subArea}</span>
            <span>{item.configCount} configurations</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {RELEVANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleRelevanceChange(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                relevance === opt.value
                  ? opt.style
                  : "bg-card text-muted-foreground/60 border hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {item.selected && (
          <Select value={item.currentState ?? ""} onValueChange={handleCurrentStateChange}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Current state" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_STATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="bg-muted/40 p-5 rounded-md mb-3 mx-1 border-t border">
          <Tabs defaultValue="purpose">
            <TabsList>
              <TabsTrigger value="purpose">Purpose</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="prerequisites">Prerequisites</TabsTrigger>
              {item.tutorialUrl && <TabsTrigger value="tutorial">Tutorial</TabsTrigger>}
            </TabsList>
            <TabsContent value="purpose" className="mt-3">
              <div
                className="prose prose-sm max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(item.purposeHtml) }}
              />
            </TabsContent>
            <TabsContent value="overview" className="mt-3">
              <div
                className="prose prose-sm max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(item.overviewHtml) }}
              />
            </TabsContent>
            <TabsContent value="prerequisites" className="mt-3">
              <div
                className="prose prose-sm max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(item.prerequisitesHtml) }}
              />
            </TabsContent>
            {item.tutorialUrl && (
              <TabsContent value="tutorial" className="mt-3">
                <a
                  href={item.tutorialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-500 hover:text-blue-600"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Tutorial
                </a>
              </TabsContent>
            )}
          </Tabs>

          <div className="mt-4">
            <label htmlFor={`notes-${item.id}`} className="block text-xs font-medium text-muted-foreground mb-1">
              Notes about this scope item
            </label>
            <Textarea
              id={`notes-${item.id}`}
              value={item.notes ?? ""}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Notes about this scope item..."
              className="text-sm"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}
