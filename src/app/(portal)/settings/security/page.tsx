"use client";

import { KeyRound } from "lucide-react";
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
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-muted-foreground">
          Manage your authentication methods and security settings.
        </p>
      </div>

      <Card data-tour="passkey-section">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            <CardTitle>Passkeys</CardTitle>
          </div>
          <CardDescription>
            Sign in with your fingerprint, face, or device PIN. Passkeys are phishing-resistant and the only second factor — there is no password or authenticator-app fallback. Lost your device? Sign in with a magic link from your inbox and add a new passkey here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasskeyCredentialList />
          <PasskeyRegistrationButton onSuccess={handlePasskeyAdded} />
        </CardContent>
      </Card>
    </div>
  );
}
