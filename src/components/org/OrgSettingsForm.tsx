"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface OrgData {
  id: string;
  name: string;
  slug: string | null;
  orgType: string;
  ssoEnabled: boolean;
  ssoProvider: string | null;
  ssoDomain: string | null;
  scimEnabled: boolean;
  mfaPolicy: string;
  maxConcurrentSessions: number;
  brandPrimaryColor: string | null;
  brandLogoUrl: string | null;
}

interface OrgSettingsFormProps {
  organization: OrgData;
}

export function OrgSettingsForm({ organization }: OrgSettingsFormProps) {
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug ?? "");
  const [mfaPolicy, setMfaPolicy] = useState(organization.mfaPolicy);
  const [maxSessions, setMaxSessions] = useState(organization.maxConcurrentSessions);
  const [ssoEnabled, setSsoEnabled] = useState(organization.ssoEnabled);
  const [primaryColor, setPrimaryColor] = useState(organization.brandPrimaryColor ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/organizations/${organization.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug || undefined,
          mfaPolicy,
          maxConcurrentSessions: maxSessions,
          ssoEnabled,
          brandPrimaryColor: primaryColor || undefined,
        }),
      });
    } finally {
      setSaving(false);
    }
  }, [organization.id, name, slug, mfaPolicy, maxSessions, ssoEnabled, primaryColor]);

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Configure your organization preferences and policies.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="org-slug">Slug</Label>
          <Input
            id="org-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-organization"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Lowercase alphanumeric with hyphens only.
          </p>
        </div>

        <div>
          <Label>MFA Policy</Label>
          <Select value={mfaPolicy} onValueChange={setMfaPolicy}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
              <SelectItem value="required">Required</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="max-sessions">Max Concurrent Sessions</Label>
          <Input
            id="max-sessions"
            type="number"
            min={1}
            max={10}
            value={maxSessions}
            onChange={(e) => setMaxSessions(parseInt(e.target.value, 10) || 1)}
            className="mt-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="sso-enabled"
            checked={ssoEnabled}
            onCheckedChange={(checked) => setSsoEnabled(checked === true)}
          />
          <Label htmlFor="sso-enabled">SSO Enabled</Label>
        </div>

        <div>
          <Label htmlFor="primary-color">Brand Primary Color</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              id="primary-color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#1a73e8"
            />
            {primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor) && (
              <span
                className="w-9 h-9 rounded-md border shrink-0"
                style={{ backgroundColor: primaryColor }}
                aria-label={`Color preview: ${primaryColor}`}
              />
            )}
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
