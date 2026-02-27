"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasskeyCredentialList } from "@/components/auth/PasskeyCredentialList";
import { PasskeyRegistrationButton } from "@/components/auth/PasskeyRegistrationButton";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export default function SecuritySettingsPage() {
  const router = useRouter();

  const handlePasskeyAdded = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-muted-foreground">
          Manage your authentication methods and security settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            <CardTitle>Passkeys</CardTitle>
          </div>
          <CardDescription>
            Sign in with your fingerprint, face, or device PIN. Passkeys are phishing-resistant and replace both your password and second factor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasskeyCredentialList />
          <PasskeyRegistrationButton onSuccess={handlePasskeyAdded} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            <CardTitle>Two-factor authentication (TOTP)</CardTitle>
          </div>
          <CardDescription>
            Use an authenticator app to generate time-based one-time passwords.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/mfa/setup"
            className="text-sm text-primary hover:underline"
          >
            Manage TOTP settings
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
