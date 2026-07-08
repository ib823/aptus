"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GatedButton } from "@/components/ui/gated-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UI_TEXT } from "@/constants/ui-text";
import { COUNTRY_NAMES, getCountryLabel } from "@/constants/countries";

interface CatalogVersionOption {
  id: string;
  version: string;
  ingestedAt: string;
  scopeItemCount: number;
}
interface CatalogEditionGroup {
  edition: string;
  versions: CatalogVersionOption[];
}

const EDITION_LABELS: Record<string, string> = {
  PUBLIC: "Public Edition",
  PRIVATE: "Private Edition",
  ON_PREM: "On-Premise",
};

const INDUSTRY_OPTIONS = [
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Retail", label: "Retail" },
  { value: "Professional Services", label: "Professional Services" },
  { value: "Wholesale Distribution", label: "Wholesale Distribution" },
  { value: "Life Sciences", label: "Life Sciences" },
  { value: "Consumer Products", label: "Consumer Products" },
  { value: "Automotive", label: "Automotive" },
  { value: "Oil & Gas", label: "Oil & Gas" },
  { value: "Utilities", label: "Utilities" },
  { value: "Mining", label: "Mining" },
  { value: "Public Sector", label: "Public Sector" },
  { value: "Higher Education", label: "Higher Education" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Banking", label: "Banking" },
  { value: "Insurance", label: "Insurance" },
  { value: "Telecommunications", label: "Telecommunications" },
  { value: "Other", label: "Other" },
];

const COMPANY_SIZES = [
  { value: "small", label: "Small (1-500 employees)" },
  { value: "midsize", label: "Mid-size (500-5,000 employees)" },
  { value: "large", label: "Large (5,000-50,000 employees)" },
  { value: "enterprise", label: "Enterprise (50,000+ employees)" },
];

export function NewAssessmentForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    industry: "",
    country: "",
    companySize: "",
    edition: "",
    catalogVersionId: "",
  });

  // Phase 13.4 — load active catalog versions for the cascading picker
  const [catalogEditions, setCatalogEditions] = useState<CatalogEditionGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog-versions")
      .then((r) => r.json())
      .then((data: { editions?: CatalogEditionGroup[] }) => {
        if (cancelled) return;
        const editions = data.editions ?? [];
        setCatalogEditions(editions);
        // Default: pick the first edition's most-recent version (UI prefers PUBLIC first)
        if (editions.length > 0 && editions[0]?.versions[0]) {
          const firstEdition = editions[0];
          setFormData((prev) => ({
            ...prev,
            edition: firstEdition.edition,
            catalogVersionId: firstEdition.versions[0]!.id,
          }));
        }
      })
      .catch(() => {
        // Non-blocking: form still works with default catalogVersionId on the API
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(
    (field: string, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleEditionChange = useCallback(
    (edition: string) => {
      const group = catalogEditions.find((e) => e.edition === edition);
      const firstVersion = group?.versions[0]?.id ?? "";
      setFormData((prev) => ({ ...prev, edition, catalogVersionId: firstVersion }));
    },
    [catalogEditions],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const response = await fetch("/api/assessments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: formData.companyName,
            industry: formData.industry,
            country: formData.country,
            companySize: formData.companySize,
            operatingCountries: [formData.country],
            ...(formData.catalogVersionId ? { catalogVersionId: formData.catalogVersionId } : {}),
          }),
        });

        const data: { data?: { id: string }; error?: { message: string } } =
          await response.json();

        if (!response.ok) {
          setError(data.error?.message ?? "Failed to create assessment. Please try again.");
          return;
        }

        if (data.data?.id) {
          router.push(`/assessment/${data.data.id}/profile`);
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [formData, router],
  );

  const isValid = formData.companyName && formData.industry && formData.country && formData.companySize;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="company-name" className="block text-sm font-medium text-foreground mb-1">
          {UI_TEXT.assessment.companyName}
        </label>
        <Input
          id="company-name"
          value={formData.companyName}
          onChange={(e) => handleChange("companyName", e.target.value)}
          placeholder="Acme Corporation"
          required
        />
      </div>

      <div>
        <label htmlFor="industry" className="block text-sm font-medium text-foreground mb-1">
          {UI_TEXT.assessment.industry}
        </label>
        <Select value={formData.industry} onValueChange={(val) => handleChange("industry", val)}>
          <SelectTrigger id="industry">
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor="country" className="block text-sm font-medium text-foreground mb-1">
          {UI_TEXT.assessment.country}
        </label>
        <Select value={formData.country} onValueChange={(val) => handleChange("country", val)}>
          <SelectTrigger id="country">
            <SelectValue placeholder="Select country">
              {formData.country ? getCountryLabel(formData.country) : "Select country"}
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
        <label htmlFor="company-size" className="block text-sm font-medium text-foreground mb-1">
          {UI_TEXT.assessment.companySize}
        </label>
        <Select value={formData.companySize} onValueChange={(val) => handleChange("companySize", val)}>
          <SelectTrigger id="company-size">
            <SelectValue placeholder="Select company size" />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Phase 13.4 — Edition + Version cascading picker */}
      {!catalogLoading && catalogEditions.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="catalog-edition" className="block text-sm font-medium text-foreground mb-1">
              SAP Edition
            </label>
            <Select value={formData.edition} onValueChange={handleEditionChange}>
              <SelectTrigger id="catalog-edition">
                <SelectValue placeholder="Select edition" />
              </SelectTrigger>
              <SelectContent>
                {catalogEditions.map((g) => (
                  <SelectItem key={g.edition} value={g.edition}>
                    {EDITION_LABELS[g.edition] ?? g.edition}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="catalog-version" className="block text-sm font-medium text-foreground mb-1">
              Catalog Version
            </label>
            <Select
              value={formData.catalogVersionId}
              onValueChange={(val) => handleChange("catalogVersionId", val)}
              disabled={!formData.edition}
            >
              <SelectTrigger id="catalog-version">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {(catalogEditions.find((e) => e.edition === formData.edition)?.versions ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.version} ({v.scopeItemCount} scope items)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500" role="alert">{error}</p>
      )}

      <div>
        <GatedButton
          type="submit"
          className="w-full h-11"
          gated={!isValid}
          gatedReason="Complete all fields above to create an assessment."
          disabled={loading}
        >
          {loading ? "Creating..." : UI_TEXT.assessment.createButton}
        </GatedButton>
        {!isValid && (
          <p id="create-hint" className="text-xs text-muted-foreground mt-2 text-center">
            Complete all fields above to create an assessment.
          </p>
        )}
      </div>
    </form>
  );
}
