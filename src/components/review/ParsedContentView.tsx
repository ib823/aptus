"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { sanitizeHtmlContent } from "@/lib/security/sanitize";

interface ParsedStepContent {
  purpose: string | null;
  prerequisites: string | null;
  systemAccess: string | null;
  roles: string | null;
  masterData: string | null;
  mainInstructions: string;
  rawHtml: string;
}

interface ParsedContentViewProps {
  content: ParsedStepContent | null;
  fallbackHtml: string;
}

function ContentSection({
  title,
  html,
  defaultOpen = false,
}: {
  title: string;
  html: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
      </button>
      {open && (
        <div
          className="prose prose-sm max-w-none text-muted-foreground pb-3 pl-5"
          dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(html) }}
        />
      )}
    </div>
  );
}

export function ParsedContentView({ content, fallbackHtml }: ParsedContentViewProps) {
  if (!content) {
    return (
      <div
        className="prose prose-sm max-w-none text-foreground"
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(fallbackHtml) }}
      />
    );
  }

  const hasSections = content.purpose || content.prerequisites || content.systemAccess || content.roles || content.masterData;

  if (!hasSections) {
    return (
      <div
        className="prose prose-sm max-w-none text-foreground"
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(content.mainInstructions) }}
      />
    );
  }

  return (
    <div className="space-y-0">
      {content.purpose && (
        <ContentSection title="Purpose" html={content.purpose} defaultOpen />
      )}
      {content.prerequisites && (
        <ContentSection title="Prerequisites" html={content.prerequisites} />
      )}
      {content.systemAccess && (
        <ContentSection title="System Access" html={content.systemAccess} />
      )}
      {content.roles && (
        <ContentSection title="Roles" html={content.roles} />
      )}
      {content.masterData && (
        <ContentSection title="Master Data" html={content.masterData} />
      )}
      {content.mainInstructions && content.mainInstructions.trim() !== content.rawHtml.trim() && (
        <ContentSection title="Instructions" html={content.mainInstructions} defaultOpen />
      )}
    </div>
  );
}
