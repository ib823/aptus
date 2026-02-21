"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface SignatureFormProps {
  signatureType: "EXECUTIVE" | "PARTNER";
  onSubmit: (data: { authorityStatement: string; signerTitle: string; signerOrganization: string }) => void;
  isSubmitting?: boolean | undefined;
  className?: string | undefined;
}

export function SignatureForm({ signatureType, onSubmit, isSubmitting, className }: SignatureFormProps) {
  const [authorityStatement, setAuthorityStatement] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerOrganization, setSignerOrganization] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const canSubmit = authorityStatement.length >= 10 && signerOrganization.length > 0 && acknowledged;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit({ authorityStatement, signerTitle, signerOrganization });
    }
  };

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-base">
          {signatureType === "EXECUTIVE" ? "Executive Sign-Off" : "Partner Countersign"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="signerOrganization">Organization</Label>
          <Input
            id="signerOrganization"
            value={signerOrganization}
            onChange={(e) => setSignerOrganization(e.target.value)}
            placeholder="Your organization name"
          />
        </div>
        <div>
          <Label htmlFor="signerTitle">Title (optional)</Label>
          <Input
            id="signerTitle"
            value={signerTitle}
            onChange={(e) => setSignerTitle(e.target.value)}
            placeholder="Your job title"
          />
        </div>
        <div>
          <Label htmlFor="authorityStatement">Authority Statement</Label>
          <Textarea
            id="authorityStatement"
            value={authorityStatement}
            onChange={(e) => setAuthorityStatement(e.target.value)}
            placeholder="I hereby confirm that I have the authority to approve this assessment on behalf of my organization and that I have reviewed all findings and recommendations contained herein..."
            rows={4}
          />
          <p className="mt-1 text-xs text-muted-foreground">Minimum 10 characters</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
          />
          <Label htmlFor="acknowledge" className="text-sm">
            I acknowledge that this digital signature is legally binding and represents my approval of the assessment.
          </Label>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || (isSubmitting ?? false)}
          className="w-full"
        >
          {(isSubmitting ?? false) ? "Submitting..." : "Sign & Submit"}
        </Button>
      </CardContent>
    </Card>
  );
}
