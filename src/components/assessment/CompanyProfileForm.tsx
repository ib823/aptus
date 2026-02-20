"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UI_TEXT } from "@/constants/ui-text";

const COMPANY_SIZES = [
  { value: "small", label: "Small (1-500 employees)" },
  { value: "midsize", label: "Mid-size (500-5,000 employees)" },
  { value: "large", label: "Large (5,000-50,000 employees)" },
  { value: "enterprise", label: "Enterprise (50,000+ employees)" },
];

const ERP_OPTIONS = [
  { value: "sap_ecc", label: "SAP ECC" },
  { value: "oracle", label: "Oracle" },
  { value: "none", label: "No ERP" },
  { value: "other", label: "Other" },
];

export function CompanyProfileForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    industry: "",
    country: "",
    companySize: "",
    revenueBand: "",
    currentErp: "",
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
          router.push(`/assessment/${data.data.id}/scope`);
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
        <label htmlFor="company-name" className="block text-sm font-medium text-gray-700 mb-1">
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
        <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
          {UI_TEXT.assessment.industry}
        </label>
        <Input
          id="industry"
          value={formData.industry}
          onChange={(e) => handleChange("industry", e.target.value)}
          placeholder="Manufacturing"
          required
        />
      </div>

      <div>
        <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
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
        <label htmlFor="company-size" className="block text-sm font-medium text-gray-700 mb-1">
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

      <div>
        <label htmlFor="current-erp" className="block text-sm font-medium text-gray-700 mb-1">
          {UI_TEXT.assessment.currentErp}
        </label>
        <Select value={formData.currentErp} onValueChange={(val) => handleChange("currentErp", val)}>
          <SelectTrigger id="current-erp">
            <SelectValue placeholder="Select current ERP (optional)" />
          </SelectTrigger>
          <SelectContent>
            {ERP_OPTIONS.map((erp) => (
              <SelectItem key={erp.value} value={erp.value}>
                {erp.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-11"
        disabled={!isValid || loading}
      >
        {loading ? "Creating..." : UI_TEXT.assessment.createButton}
      </Button>
    </form>
  );
}
