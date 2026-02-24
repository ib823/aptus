"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AptusLogo } from "@/components/shared/AptusLogo";
import { TotpVerifyForm } from "@/components/mfa/TotpVerifyForm";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { UI_TEXT } from "@/constants/ui-text";

export default function MfaVerifyPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/mfa/status");
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        setAuthenticated(true);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  const handleVerified = useCallback(() => {
    router.push("/assessments");
  }, [router]);

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="text-center pb-2">
          <AptusLogo size="lg" className="mb-6 justify-center" />
        </CardHeader>
        <CardContent>
          <LoadingSkeleton lines={3} />
        </CardContent>
      </Card>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="text-center pb-2">
        <AptusLogo size="lg" className="mb-6 justify-center" />
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
