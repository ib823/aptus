"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div>
        <h2 className="text-lg font-semibold">Organization Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure your organization preferences and policies.
        </p>
      </div>

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
          <Label htmlFor="mfa-policy">MFA Policy</Label>
          <select
            id="mfa-policy"
            value={mfaPolicy}
            onChange={(e) => setMfaPolicy(e.target.value)}
            className="mt-1 w-full h-9 px-3 text-sm border border-input rounded-md bg-background"
          >
            <option value="disabled">Disabled</option>
            <option value="optional">Optional</option>
            <option value="required">Required</option>
          </select>
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
          <input
            id="sso-enabled"
            type="checkbox"
            checked={ssoEnabled}
            onChange={(e) => setSsoEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="sso-enabled">SSO Enabled</Label>
        </div>

        <div>
          <Label htmlFor="primary-color">Brand Primary Color</Label>
          <Input
            id="primary-color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder="#1a73e8"
            className="mt-1"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
