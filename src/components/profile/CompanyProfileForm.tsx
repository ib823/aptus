"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProfileCompletenessBar } from "@/components/profile/ProfileCompletenessBar";
import {
  CURRENCY_CODES,
  LANGUAGE_CODES,
  SAP_MODULES,
  DEPLOYMENT_MODELS,
  MIGRATION_APPROACHES,
  REGULATORY_FRAMEWORKS,
} from "@/constants/profile-options";
import type { ProfileCompletenessBreakdown } from "@/types/assessment";

interface ProfileData {
  companyName: string;
  industry: string;
  country: string;
  operatingCountries: string[];
  companySize: string;
  revenueBand: string | null;
  employeeCount: number | null;
  annualRevenue: number | null;
  currencyCode: string | null;
  targetGoLiveDate: string | null;
  deploymentModel: string | null;
  sapModules: string[];
  keyProcesses: string[];
  languageRequirements: string[];
  regulatoryFrameworks: string[];
  itLandscapeSummary: string | null;
  currentErpVersion: string | null;
  migrationApproach: string | null;
  completenessScore: number;
  completenessBreakdown: ProfileCompletenessBreakdown;
}

interface CompanyProfileFormProps {
  assessmentId: string;
  initialProfile: ProfileData;
  isReadOnly?: boolean;
}

interface SectionProps {
  title: string;
  complete: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, complete, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {complete ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />
          )}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t">{children}</div>}
    </div>
  );
}

export function CompanyProfileForm({ assessmentId, initialProfile, isReadOnly }: CompanyProfileFormProps) {
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingSave.current) clearTimeout(pendingSave.current);
    };
  }, []);

  const saveProfile = useCallback(
    (data: Record<string, unknown>) => {
      if (pendingSave.current) clearTimeout(pendingSave.current);
      pendingSave.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/assessments/${assessmentId}/profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const json = await res.json();
            setProfile((prev) => ({
              ...prev,
              completenessScore: json.data.completenessScore,
              completenessBreakdown: json.data.completenessBreakdown,
            }));
          }
        } catch {
          // Silently fail — user can retry
        }
      }, 500);
    },
    [assessmentId],
  );

  const updateField = useCallback(
    (field: string, value: unknown) => {
      if (isReadOnly) return;
      setProfile((prev) => ({ ...prev, [field]: value }));
      saveProfile({ [field]: value });
    },
    [isReadOnly, saveProfile],
  );

  const toggleArrayItem = useCallback(
    (field: string, item: string) => {
      if (isReadOnly) return;
      setProfile((prev) => {
        const arr = (prev as unknown as Record<string, unknown>)[field] as string[] | undefined ?? [];
        const newArr = arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
        saveProfile({ [field]: newArr });
        return { ...prev, [field]: newArr };
      });
    },
    [isReadOnly, saveProfile],
  );

  const bd = profile.completenessBreakdown;

  return (
    <div className="space-y-6">
      <ProfileCompletenessBar score={profile.completenessScore} breakdown={bd} />

      <div className="space-y-3">
        {/* Section 1: Basic Info */}
        <CollapsibleSection title="Basic Information" complete={bd.basic} defaultOpen>
          <div className="grid grid-cols-2 gap-4 pt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Name</label>
              <Input
                value={profile.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                disabled={isReadOnly ?? false}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Industry</label>
              <Input
                value={profile.industry}
                onChange={(e) => updateField("industry", e.target.value)}
                disabled={isReadOnly ?? false}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Country</label>
              <Input
                value={profile.country}
                onChange={(e) => updateField("country", e.target.value)}
                disabled={isReadOnly ?? false}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Size</label>
              <Select value={profile.companySize} onValueChange={(v) => updateField("companySize", v)} disabled={isReadOnly ?? false}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="midsize">Midsize</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 2: Financial & Scale */}
        <CollapsibleSection title="Financial & Scale" complete={bd.financial}>
          <div className="grid grid-cols-2 gap-4 pt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Employee Count</label>
              <Input
                type="number"
                value={profile.employeeCount ?? ""}
                onChange={(e) => updateField("employeeCount", e.target.value ? Number(e.target.value) : null)}
                disabled={isReadOnly ?? false}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Annual Revenue</label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  value={profile.annualRevenue ?? ""}
                  onChange={(e) => updateField("annualRevenue", e.target.value ? Number(e.target.value) : null)}
                  disabled={isReadOnly ?? false}
                  className="flex-1"
                />
                <Select value={profile.currencyCode ?? "USD"} onValueChange={(v) => updateField("currencyCode", v)} disabled={isReadOnly ?? false}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_CODES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 3: SAP Strategy */}
        <CollapsibleSection title="SAP Strategy" complete={bd.sapStrategy}>
          <div className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Deployment Model</label>
                <Select value={profile.deploymentModel ?? ""} onValueChange={(v) => updateField("deploymentModel", v)} disabled={isReadOnly ?? false}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select model" /></SelectTrigger>
                  <SelectContent>
                    {DEPLOYMENT_MODELS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Migration Approach</label>
                <Select value={profile.migrationApproach ?? ""} onValueChange={(v) => updateField("migrationApproach", v)} disabled={isReadOnly ?? false}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select approach" /></SelectTrigger>
                  <SelectContent>
                    {MIGRATION_APPROACHES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Go-Live Date</label>
              <Input
                type="date"
                value={profile.targetGoLiveDate ? profile.targetGoLiveDate.split("T")[0] : ""}
                onChange={(e) => updateField("targetGoLiveDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                disabled={isReadOnly ?? false}
                className="mt-1 w-48"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">SAP Modules</label>
              <div className="flex flex-wrap gap-1.5">
                {SAP_MODULES.map((m) => {
                  const selected = profile.sapModules.includes(m.code);
                  return (
                    <button
                      key={m.code}
                      onClick={() => toggleArrayItem("sapModules", m.code)}
                      disabled={isReadOnly ?? false}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                        selected
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-card text-muted-foreground border hover:bg-accent"
                      }`}
                    >
                      {m.code}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 4: Operational Context */}
        <CollapsibleSection title="Operational Context" complete={bd.operational}>
          <div className="space-y-4 pt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Key Business Processes</label>
              <Textarea
                value={profile.keyProcesses.join(", ")}
                onChange={(e) => updateField("keyProcesses", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="Comma-separated: Order to Cash, Procure to Pay, ..."
                disabled={isReadOnly ?? false}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Operating Countries</label>
              <Textarea
                value={profile.operatingCountries.join(", ")}
                onChange={(e) => updateField("operatingCountries", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="Comma-separated: MY, SG, US, ..."
                disabled={isReadOnly ?? false}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Language Requirements</label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGE_CODES.map((lang) => {
                  const selected = profile.languageRequirements.includes(lang);
                  return (
                    <button
                      key={lang}
                      onClick={() => toggleArrayItem("languageRequirements", lang)}
                      disabled={isReadOnly ?? false}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                        selected
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-card text-muted-foreground border hover:bg-accent"
                      }`}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Regulatory Frameworks</label>
              <div className="flex flex-wrap gap-1.5">
                {REGULATORY_FRAMEWORKS.map((fw) => {
                  const selected = profile.regulatoryFrameworks.includes(fw);
                  return (
                    <button
                      key={fw}
                      onClick={() => toggleArrayItem("regulatoryFrameworks", fw)}
                      disabled={isReadOnly ?? false}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                        selected
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-card text-muted-foreground border hover:bg-accent"
                      }`}
                    >
                      {fw}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 5: IT Landscape */}
        <CollapsibleSection title="IT Landscape" complete={bd.itLandscape}>
          <div className="space-y-4 pt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Current ERP Version</label>
              <Input
                value={profile.currentErpVersion ?? ""}
                onChange={(e) => updateField("currentErpVersion", e.target.value || null)}
                placeholder="e.g., SAP ECC 6.0 EHP8, Oracle E-Business Suite"
                disabled={isReadOnly ?? false}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">IT Landscape Summary</label>
              <Textarea
                value={profile.itLandscapeSummary ?? ""}
                onChange={(e) => updateField("itLandscapeSummary", e.target.value || null)}
                placeholder="Describe key systems, integrations, and infrastructure..."
                disabled={isReadOnly ?? false}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
