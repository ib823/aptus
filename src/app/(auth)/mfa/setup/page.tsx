"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
import { TotpSetupForm } from "@/components/mfa/TotpSetupForm";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { UI_TEXT } from "@/constants/ui-text";

interface MfaSetupData {
  secret: string;
  uri: string;
  alreadySetup: boolean;
}

export default function MfaSetupPage() {
  const router = useRouter();
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSetup() {
      try {
        // Check session first — redirect unauthenticated users
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        if (!sessionData?.user?.email && !sessionData?.user?.id) {
          // Also check abeam-session via MFA endpoint
          const response = await fetch("/api/auth/mfa/setup");
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
          const data: { data?: MfaSetupData } = await response.json();
          if (data.data) {
            if (data.data.alreadySetup) {
              router.replace("/mfa/verify");
              return;
            }
            setSetupData(data.data);
          }
        } else {
          const response = await fetch("/api/auth/mfa/setup");
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
          const data: { data?: MfaSetupData } = await response.json();
          if (data.data) {
            if (data.data.alreadySetup) {
              router.replace("/mfa/verify");
              return;
            }
            setSetupData(data.data);
          }
        }
      } catch {
        // Error handling
      } finally {
        setLoading(false);
      }
    }

    fetchSetup();
  }, [router]);

  const handleVerified = useCallback(() => {
    router.push("/assessments");
  }, [router]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {UI_TEXT.auth.mfaSetupTitle}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {UI_TEXT.auth.mfaSetupDescription}
        </p>
      </div>
      {loading ? (
        <LoadingSkeleton lines={4} />
      ) : setupData ? (
        <TotpSetupForm
          qrUri={setupData.uri}
          secret={setupData.secret}
          onVerified={handleVerified}
        />
      ) : (
        <p className="text-sm text-destructive text-center">
          {UI_TEXT.errors.generic}
        </p>
      )}
    </div>
  );
}
