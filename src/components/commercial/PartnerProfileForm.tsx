"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface PartnerProfileFormProps {
  initialName?: string | undefined;
  initialIndustryFocus?: string[] | undefined;
  initialContactEmail?: string | null | undefined;
  initialWebsiteUrl?: string | null | undefined;
}

export function PartnerProfileForm({
  initialName,
  initialIndustryFocus,
  initialContactEmail,
  initialWebsiteUrl,
}: PartnerProfileFormProps) {
  const [name, setName] = useState(initialName ?? "");
  const [industryFocus, setIndustryFocus] = useState<string[]>(initialIndustryFocus ?? []);
  const [industryInput, setIndustryInput] = useState("");
  const [contactEmail, setContactEmail] = useState(initialContactEmail ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addIndustry = () => {
    const trimmed = industryInput.trim();
    if (trimmed && !industryFocus.includes(trimmed)) {
      setIndustryFocus([...industryFocus, trimmed]);
      setIndustryInput("");
    }
  };

  const removeIndustry = (industry: string) => {
    setIndustryFocus(industryFocus.filter((i) => i !== industry));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addIndustry();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/partner/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          industryFocus,
          contactEmail: contactEmail || undefined,
          websiteUrl: websiteUrl || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } };
        setError(data.error?.message ?? "Failed to save profile");
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
        <CardTitle>Organization Profile</CardTitle>
        <CardDescription>Manage your organization details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="orgName">Company Name</Label>
          <Input
            id="orgName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="industryInput">Industry Focus</Label>
          <div className="flex gap-2">
            <Input
              id="industryInput"
              value={industryInput}
              onChange={(e) => setIndustryInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add industry (press Enter)"
            />
            <Button type="button" variant="outline" onClick={addIndustry}>
              Add
            </Button>
          </div>
          {industryFocus.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {industryFocus.map((industry) => (
                <Badge key={industry} variant="secondary" className="gap-1">
                  {industry}
                  <button
                    type="button"
                    onClick={() => removeIndustry(industry)}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactEmail">Contact Email</Label>
          <Input
            id="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="contact@company.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="websiteUrl">Website URL</Label>
          <Input
            id="websiteUrl"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://www.company.com"
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {saved ? (
          <p className="text-sm text-green-600">Profile saved successfully.</p>
        ) : null}

        <Button onClick={handleSave} disabled={saving ?? false}>
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </CardContent>
    </Card>
  );
}
