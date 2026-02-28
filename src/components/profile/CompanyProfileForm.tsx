"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import { getCountryLabel, COUNTRY_NAMES } from "@/constants/countries";
import { getDefaultCurrency } from "@/constants/currencies";
import { getModuleFullName } from "@/constants/sap-modules";
import { getRelevantFrameworks, getRelevantLanguages } from "@/constants/regulatory";
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
  operationalSites: number | null;
  completenessScore: number;
  completenessBreakdown: ProfileCompletenessBreakdown;
}

interface CompanyProfileFormProps {
  assessmentId: string;
  initialProfile: ProfileData;
  isReadOnly?: boolean;
  userRole?: string;
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

export function CompanyProfileForm({ assessmentId, initialProfile, isReadOnly, userRole }: CompanyProfileFormProps) {
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [currencyManuallySet, setCurrencyManuallySet] = useState(false);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingSave.current) clearTimeout(pendingSave.current);
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    };
  }, []);

  const saveProfile = useCallback(
    (data: Record<string, unknown>) => {
      if (pendingSave.current) clearTimeout(pendingSave.current);
      setSaveStatus("saving");
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
            setSaveStatus("saved");
            if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
            saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
          }
        } catch {
          setSaveStatus("idle");
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

  // REM-08: Auto-set currency when country changes
  const handleCountryChange = useCallback(
    (newCountry: string) => {
      updateField("country", newCountry);
      if (!currencyManuallySet) {
        const defaultCurrency = getDefaultCurrency(newCountry);
        setProfile((prev) => ({ ...prev, currencyCode: defaultCurrency }));
        saveProfile({ country: newCountry, currencyCode: defaultCurrency });
      }
    },
    [updateField, currencyManuallySet, saveProfile],
  );

  // REM-13: Separate regulatory frameworks into suggested + other
  const suggestedFrameworks = useMemo(() => getRelevantFrameworks(profile.country), [profile.country]);
  const otherFrameworks = useMemo(
    () => REGULATORY_FRAMEWORKS.filter((fw) => !suggestedFrameworks.includes(fw)),
    [suggestedFrameworks],
  );

  // REM-14: Separate languages into suggested + other
  const suggestedLanguages = useMemo(() => getRelevantLanguages(profile.country), [profile.country]);
  const otherLanguages = useMemo(
    () => LANGUAGE_CODES.filter((lang) => !suggestedLanguages.includes(lang)),
    [suggestedLanguages],
  );

  const bd = profile.completenessBreakdown;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <ProfileCompletenessBar score={profile.completenessScore} breakdown={bd} />
        <span className={`text-xs transition-opacity ${saveStatus === "idle" ? "opacity-0" : "opacity-100"} ${saveStatus === "saving" ? "text-muted-foreground" : "text-green-600"}`}>
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : ""}
        </span>
      </div>

      {/* Two-column card layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: Identity & Scale */}
        <div className="space-y-3">
          {/* Section 1: Basic Info */}
          <CollapsibleSection title="Basic Information" complete={bd.basic} defaultOpen>
            <div className="grid grid-cols-2 gap-4 pt-3">
              <div>
                <label htmlFor="profile-company-name" className="text-xs font-medium text-muted-foreground">Company Name</label>
                <Input
                  id="profile-company-name"
                  value={profile.companyName}
                  onChange={(e) => updateField("companyName", e.target.value)}
                  disabled={isReadOnly ?? false}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="profile-industry" className="text-xs font-medium text-muted-foreground">Industry</label>
                <Input
                  id="profile-industry"
                  value={profile.industry}
                  onChange={(e) => updateField("industry", e.target.value)}
                  disabled={isReadOnly ?? false}
                  className="mt-1"
                />
              </div>
              <div>
                {/* REM-07: Country name display */}
                <label htmlFor="profile-country" className="text-xs font-medium text-muted-foreground">Country</label>
                <Select
                  value={profile.country}
                  onValueChange={handleCountryChange}
                  disabled={isReadOnly ?? false}
                >
                  <SelectTrigger id="profile-country" className="mt-1">
                    <SelectValue placeholder="Select country">
                      {profile.country ? getCountryLabel(profile.country) : "Select country"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(COUNTRY_NAMES).map((code) => (
                      <SelectItem key={code} value={code}>
                        {getCountryLabel(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="profile-company-size" className="text-xs font-medium text-muted-foreground">Company Size</label>
                <Select value={profile.companySize} onValueChange={(v) => updateField("companySize", v)} disabled={isReadOnly ?? false}>
                  <SelectTrigger id="profile-company-size" className="mt-1"><SelectValue placeholder="Select size" /></SelectTrigger>
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
                <label htmlFor="profile-employee-count" className="text-xs font-medium text-muted-foreground">Employee Count</label>
                <Input
                  id="profile-employee-count"
                  type="number"
                  value={profile.employeeCount ?? ""}
                  onChange={(e) => updateField("employeeCount", e.target.value ? Number(e.target.value) : null)}
                  disabled={isReadOnly ?? false}
                  className="mt-1"
                />
              </div>
              <div>
                {/* REM-08: Revenue field guidance */}
                <label htmlFor="profile-annual-revenue" className="text-xs font-medium text-muted-foreground">Annual Revenue</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="profile-annual-revenue"
                    type="number"
                    placeholder="e.g., 2500000"
                    value={profile.annualRevenue ?? ""}
                    onChange={(e) => updateField("annualRevenue", e.target.value ? Number(e.target.value) : null)}
                    disabled={isReadOnly ?? false}
                    className="flex-1"
                  />
                  <Select
                    value={profile.currencyCode ?? "USD"}
                    onValueChange={(v) => {
                      setCurrencyManuallySet(true);
                      updateField("currencyCode", v);
                    }}
                    disabled={isReadOnly ?? false}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCY_CODES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your annual revenue in absolute numbers (e.g., 2,500,000 for 2.5 million). Select your local currency.
                </p>
              </div>
              {/* REM-16: Number of operational sites */}
              <div>
                <label htmlFor="profile-operational-sites" className="text-xs font-medium text-muted-foreground">
                  Number of Operational Sites
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How many physical locations, plants, warehouses, or offices does your company operate?
                </p>
                <Input
                  id="profile-operational-sites"
                  type="number"
                  min={1}
                  placeholder="e.g., 2"
                  value={profile.operationalSites ?? ""}
                  onChange={(e) => updateField("operationalSites", e.target.value ? parseInt(e.target.value) : null)}
                  disabled={isReadOnly ?? false}
                  className="mt-1 w-32"
                />
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Right column: ERP & Technology */}
        <div className="space-y-3">
          {/* Section 3: SAP Strategy — hidden for business roles who can't answer these */}
          {!["process_owner", "executive_sponsor", "viewer"].includes(userRole ?? "") && (
          <CollapsibleSection title="SAP Strategy" complete={bd.sapStrategy}>
            <div className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-deployment-model" className="text-xs font-medium text-muted-foreground">Deployment Model</label>
                  <Select value={profile.deploymentModel ?? ""} onValueChange={(v) => updateField("deploymentModel", v)} disabled={isReadOnly ?? false}>
                    <SelectTrigger id="profile-deployment-model" className="mt-1"><SelectValue placeholder="Select model" /></SelectTrigger>
                    <SelectContent>
                      {DEPLOYMENT_MODELS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="profile-migration-approach" className="text-xs font-medium text-muted-foreground">Migration Approach</label>
                  <Select value={profile.migrationApproach ?? ""} onValueChange={(v) => updateField("migrationApproach", v)} disabled={isReadOnly ?? false}>
                    <SelectTrigger id="profile-migration-approach" className="mt-1"><SelectValue placeholder="Select approach" /></SelectTrigger>
                    <SelectContent>
                      {MIGRATION_APPROACHES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label htmlFor="profile-go-live-date" className="text-xs font-medium text-muted-foreground">Target Go-Live Date</label>
                <Input
                  id="profile-go-live-date"
                  type="date"
                  value={profile.targetGoLiveDate ? profile.targetGoLiveDate.split("T")[0] : ""}
                  onChange={(e) => updateField("targetGoLiveDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                  disabled={isReadOnly ?? false}
                  className="mt-1 w-48"
                />
              </div>
              <div>
                {/* REM-09: SAP Module full-name tooltips */}
                <label className="text-xs font-medium text-muted-foreground mb-2 block">SAP Modules</label>
                <div className="flex flex-wrap gap-1.5">
                  {SAP_MODULES.map((m) => {
                    const selected = profile.sapModules.includes(m.code);
                    return (
                      <button
                        key={m.code}
                        onClick={() => toggleArrayItem("sapModules", m.code)}
                        disabled={isReadOnly ?? false}
                        title={getModuleFullName(m.code)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-all cursor-help ${
                          selected
                            ? "bg-blue-50 text-blue-700 border-blue-300"
                            : "bg-card text-muted-foreground border hover:bg-accent"
                        }`}
                      >
                        {m.code} — {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CollapsibleSection>
          )}

          {/* Section 5: IT Landscape */}
          <CollapsibleSection title="IT Landscape" complete={bd.itLandscape}>
            <div className="space-y-4 pt-3">
              <div>
                <label htmlFor="profile-erp-version" className="text-xs font-medium text-muted-foreground">Current ERP Version</label>
                <Input
                  id="profile-erp-version"
                  value={profile.currentErpVersion ?? ""}
                  onChange={(e) => updateField("currentErpVersion", e.target.value || null)}
                  placeholder="e.g., SAP ECC 6.0 EHP8, Oracle E-Business Suite"
                  disabled={isReadOnly ?? false}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="profile-it-landscape" className="text-xs font-medium text-muted-foreground">IT Landscape Summary</label>
                <Textarea
                  id="profile-it-landscape"
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

      {/* Full-width: Operational Context */}
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
            {/* REM-14: Language suggestion by country */}
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Language Requirements</label>
            {suggestedLanguages.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground mb-2">Suggested for your country:</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {suggestedLanguages.map((lang) => {
                    const selected = profile.languageRequirements.includes(lang);
                    return (
                      <button
                        key={lang}
                        onClick={() => toggleArrayItem("languageRequirements", lang)}
                        disabled={isReadOnly ?? false}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                          selected
                            ? "bg-blue-50 text-blue-700 border-blue-300"
                            : "bg-blue-50/30 text-muted-foreground border-blue-200 hover:bg-accent"
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Other languages:</p>
              </>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(suggestedLanguages.length > 0 ? otherLanguages : LANGUAGE_CODES).map((lang) => {
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
                    } ${suggestedLanguages.length > 0 ? "opacity-60" : ""}`}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            {/* REM-13: Regulatory framework country filtering */}
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Regulatory Frameworks</label>
            {suggestedFrameworks.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground mb-2">Suggested for your country:</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {suggestedFrameworks.map((fw) => {
                    const selected = profile.regulatoryFrameworks.includes(fw);
                    return (
                      <button
                        key={fw}
                        onClick={() => toggleArrayItem("regulatoryFrameworks", fw)}
                        disabled={isReadOnly ?? false}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                          selected
                            ? "bg-blue-50 text-blue-700 border-blue-300"
                            : "bg-blue-50/30 text-muted-foreground border-blue-200 hover:bg-accent"
                        }`}
                      >
                        {fw}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Other frameworks:</p>
              </>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(suggestedFrameworks.length > 0 ? otherFrameworks : REGULATORY_FRAMEWORKS).map((fw) => {
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
                    } ${suggestedFrameworks.length > 0 ? "opacity-60" : ""}`}
                  >
                    {fw}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
