"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TemplateCardProps {
  id: string;
  name: string;
  description?: string | null | undefined;
  industry?: string | null | undefined;
  country?: string | null | undefined;
  modules: string[];
  timesUsed: number;
  isPublished: boolean;
  onUse: (templateId: string) => void;
  onDelete: (templateId: string) => void;
}

export function TemplateCard({
  id,
  name,
  description,
  industry,
  modules,
  timesUsed,
  isPublished,
  onUse,
  onDelete,
}: TemplateCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{name}</CardTitle>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
          {isPublished && <Badge variant="default">Published</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {industry && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Industry:</span>
              <Badge variant="outline">{industry}</Badge>
            </div>
          )}
          {modules.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {modules.slice(0, 5).map((mod) => (
                <Badge key={mod} variant="secondary" className="text-xs">
                  {mod}
                </Badge>
              ))}
              {modules.length > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{modules.length - 5} more
                </Badge>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Used {timesUsed} time{timesUsed !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button size="sm" onClick={() => onUse(id)}>
              Use Template
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
