"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
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
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />
        <LoadingSkeleton lines={3} />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {UI_TEXT.auth.mfaVerifyTitle}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {UI_TEXT.auth.mfaVerifyDescription}
        </p>
      </div>
      <TotpVerifyForm onVerified={handleVerified} />
    </div>
  );
}
