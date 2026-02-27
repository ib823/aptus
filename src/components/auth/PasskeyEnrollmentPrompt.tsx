"use client";

import { useState, useEffect, useCallback } from "react";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasskeyRegistrationButton } from "@/components/auth/PasskeyRegistrationButton";

const DISMISS_KEY = "passkey-prompt-dismissed";

interface PasskeyEnrollmentPromptProps {
  hasWebAuthn: boolean;
}

export function PasskeyEnrollmentPrompt({ hasWebAuthn }: PasskeyEnrollmentPromptProps) {
  const [visible, setVisible] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported =
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined";
    setSupported(isSupported);

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!hasWebAuthn && isSupported && !dismissed) {
      setVisible(true);
    }
  }, [hasWebAuthn]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
  }, []);

  const handleSuccess = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible || !supported || hasWebAuthn) return null;

  return (
    <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </Button>
      <div className="flex items-start gap-3 pr-8">
        <KeyRound className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-medium">Speed up your next login — add a passkey</p>
          <p className="text-xs text-muted-foreground">
            Use your fingerprint, face, or device PIN to sign in instantly — no more waiting for email links.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <PasskeyRegistrationButton onSuccess={handleSuccess} />
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
