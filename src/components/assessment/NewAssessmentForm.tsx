"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UI_TEXT } from "@/constants/ui-text";

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
  });

  const handleChange = useCallback(
    (field: string, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
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
            ...formData,
            operatingCountries: [formData.country],
          }),
        });

        const data: { data?: { id: string }; error?: { message: string } } =
          await response.json();

        if (!response.ok) {
          setError(data.error?.message ?? "Failed to create assessment");
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
        <Input
          id="country"
          value={formData.country}
          onChange={(e) => handleChange("country", e.target.value)}
          placeholder="MY"
          maxLength={10}
          required
        />
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

      {error && (
        <p className="text-sm text-red-500" role="alert">{error}</p>
      )}

      <div>
        <Button
          type="submit"
          className="w-full h-11"
          disabled={!isValid || loading}
          aria-disabled={!isValid || loading}
          aria-describedby={!isValid ? "create-hint" : undefined}
        >
          {loading ? "Creating..." : UI_TEXT.assessment.createButton}
        </Button>
        {!isValid && (
          <p id="create-hint" className="text-xs text-muted-foreground mt-2 text-center">
            Complete all fields above to create an assessment.
          </p>
        )}
      </div>
    </form>
  );
}
