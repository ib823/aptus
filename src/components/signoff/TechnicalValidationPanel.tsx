"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ValidationStatusBadge } from "./ValidationStatusBadge";
import { cn } from "@/lib/utils";

interface TechnicalLeadInfo {
  name?: string | undefined;
  email?: string | undefined;
  status?: string | undefined;
  comments?: string | undefined;
  validatedAt?: string | undefined;
}

interface TechnicalValidationPanelProps {
  itLead?: TechnicalLeadInfo | undefined;
  dmLead?: TechnicalLeadInfo | undefined;
  className?: string | undefined;
}

function LeadPanel({ title, lead }: { title: string; lead?: TechnicalLeadInfo | undefined }) {
  return (
    <div className="flex-1 rounded-lg border p-4">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {lead?.name ? (
        <div className="space-y-1">
          <p className="text-sm">{lead.name}</p>
          <p className="text-xs text-muted-foreground">{lead.email}</p>
          {lead.status ? <ValidationStatusBadge status={lead.status} /> : null}
          {lead.comments ? (
            <p className="mt-2 text-sm text-muted-foreground">{lead.comments}</p>
          ) : null}
          {lead.validatedAt ? (
            <p className="text-xs text-muted-foreground">
              Validated: {new Date(lead.validatedAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not yet assigned</p>
      )}
    </div>
  );
}

export function TechnicalValidationPanel({ itLead, dmLead, className }: TechnicalValidationPanelProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-base">Technical Validation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <LeadPanel title="IT Lead" lead={itLead} />
          <LeadPanel title="Data Migration Lead" lead={dmLead} />
        </div>
      </CardContent>
    </Card>
  );
}
