"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BoundLogo } from "@/components/shared/BoundLogo";
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
        const response = await fetch("/api/auth/mfa/setup");
        const data: { data?: MfaSetupData } = await response.json();
        if (data.data) {
          if (data.data.alreadySetup) {
            router.replace("/mfa/verify");
            return;
          }
          setSetupData(data.data);
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
    <Card className="shadow-md border-gray-200">
      <CardHeader className="text-center pb-2">
        <BoundLogo size="lg" className="mb-6" />
        <h1 className="text-2xl font-bold text-gray-950">
          {UI_TEXT.auth.mfaSetupTitle}
        </h1>
        <p className="text-base text-gray-600 mt-1">
          {UI_TEXT.auth.mfaSetupDescription}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingSkeleton lines={4} />
        ) : setupData ? (
          <TotpSetupForm
            qrUri={setupData.uri}
            secret={setupData.secret}
            onVerified={handleVerified}
          />
        ) : (
          <p className="text-sm text-red-500 text-center">
            {UI_TEXT.errors.generic}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
