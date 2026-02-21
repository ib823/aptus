"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BoundLogo } from "@/components/shared/BoundLogo";
import { TotpVerifyForm } from "@/components/mfa/TotpVerifyForm";
import { UI_TEXT } from "@/constants/ui-text";

export default function MfaVerifyPage() {
  const router = useRouter();

  const handleVerified = useCallback(() => {
    router.push("/assessments");
  }, [router]);

  return (
    <Card className="shadow-md">
      <CardHeader className="text-center pb-2">
        <BoundLogo size="lg" className="mb-6 justify-center" />
        <h1 className="text-2xl font-bold">
          {UI_TEXT.auth.mfaVerifyTitle}
        </h1>
        <p className="text-base text-muted-foreground mt-1">
          {UI_TEXT.auth.mfaVerifyDescription}
        </p>
      </CardHeader>
      <CardContent>
        <TotpVerifyForm onVerified={handleVerified} />
      </CardContent>
    </Card>
  );
}
