"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { CreateTemplateDialog } from "@/components/templates/CreateTemplateDialog";
import { UseTemplateDialog } from "@/components/templates/UseTemplateDialog";

interface Template {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  country: string | null;
  modules: string[];
  timesUsed: number;
  isPublished: boolean;
}

interface TemplatesManagerProps {
  assessments: Array<{ id: string; companyName: string }>;
}

export function TemplatesManager({ assessments }: TemplatesManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [useOpen, setUseOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/templates");
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to load templates");
      }
      const json = (await res.json()) as { data: Template[] };
      setTemplates(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleCreateTemplate = async (data: {
    assessmentId: string;
    name: string;
    description: string;
    includeGapPatterns: boolean;
    includeIntegrationPatterns: boolean;
    includeDmPatterns: boolean;
  }) => {
    try {
      setIsSubmitting(true);
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to create template");
      }
      setCreateOpen(false);
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseTemplate = async (data: {
    templateId: string;
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
  }) => {
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/assessments/from-template/${data.templateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: data.companyName,
          industry: data.industry || undefined,
          country: data.country || undefined,
          companySize: data.companySize,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to create assessment");
      }
      setUseOpen(false);
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to delete template");
      }
      void fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleUseClick = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setSelectedTemplate(tpl);
      setUseOpen(true);
    }
  };

  const filteredTemplates = filter
    ? templates.filter(
        (t) =>
          (t.industry ?? "").toLowerCase().includes(filter.toLowerCase()) ||
          t.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : templates;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Filter by name or industry..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => setCreateOpen(true)}>
          Create Template
        </Button>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {templates.length === 0
            ? "No templates yet. Create one from an existing assessment."
            : "No templates match your filter."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              id={template.id}
              name={template.name}
              description={template.description}
              industry={template.industry}
              modules={template.modules}
              timesUsed={template.timesUsed}
              isPublished={template.isPublished}
              onUse={handleUseClick}
              onDelete={handleDeleteTemplate}
            />
          ))}
        </div>
      )}

      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        assessments={assessments}
        onSubmit={handleCreateTemplate}
        isSubmitting={isSubmitting}
      />

      {selectedTemplate && (
        <UseTemplateDialog
          open={useOpen}
          onOpenChange={setUseOpen}
          templateName={selectedTemplate.name}
          templateId={selectedTemplate.id}
          onSubmit={handleUseTemplate}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
