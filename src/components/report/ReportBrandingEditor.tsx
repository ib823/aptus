"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ReportBrandingEditorProps {
  assessmentId: string;
  initialBranding?: {
    companyName?: string | null | undefined;
    primaryColor?: string | undefined;
    secondaryColor?: string | undefined;
    footerText?: string | null | undefined;
    logoUrl?: string | null | undefined;
  } | null | undefined;
}

export function ReportBrandingEditor({
  assessmentId,
  initialBranding,
}: ReportBrandingEditorProps) {
  const [companyName, setCompanyName] = useState(initialBranding?.companyName ?? "");
  const [primaryColor, setPrimaryColor] = useState(initialBranding?.primaryColor ?? "#1a1a2e");
  const [secondaryColor, setSecondaryColor] = useState(initialBranding?.secondaryColor ?? "#16213e");
  const [footerText, setFooterText] = useState(initialBranding?.footerText ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/report/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName || null,
          primaryColor,
          secondaryColor,
          footerText: footerText || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } };
        setError(data.error?.message ?? "Failed to save branding");
        return;
      }

      setSaved(true);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Branding</CardTitle>
        <CardDescription>
          Customize the appearance of generated reports for your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name</Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your company name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary Color</Label>
            <div className="flex gap-2">
              <Input
                id="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#1a1a2e"
                className="font-mono"
              />
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 rounded border cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondaryColor">Secondary Color</Label>
            <div className="flex gap-2">
              <Input
                id="secondaryColor"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="#16213e"
                className="font-mono"
              />
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-9 w-12 rounded border cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="footerText">Footer Text</Label>
          <Textarea
            id="footerText"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="Confidential — prepared by Your Company"
            rows={3}
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {saved ? (
          <p className="text-sm text-green-600">Branding saved successfully.</p>
        ) : null}

        <Button onClick={handleSave} disabled={saving ?? false}>
          {saving ? "Saving..." : "Save Branding"}
        </Button>
      </CardContent>
    </Card>
  );
}
