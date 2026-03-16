"use client";

import { useState, useEffect, useCallback } from "react";
import { KeyRound, Smartphone, ArrowLeft } from "lucide-react";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
import { TotpSetupForm } from "@/components/mfa/TotpSetupForm";
import { PasskeyRegistrationButton } from "@/components/auth/PasskeyRegistrationButton";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

interface MfaSetupData {
  secret: string;
  uri: string;
  alreadySetup: boolean;
}

type SelectedMethod = "passkey" | "totp" | null;

export default function MfaSetupPage() {
  const [selectedMethod, setSelectedMethod] = useState<SelectedMethod>(null);
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);

  useEffect(() => {
    setIsWebAuthnSupported(
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/mfa/setup");
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data: { data?: MfaSetupData } = await response.json();
        if (data.data) {
          if (data.data.alreadySetup) {
            window.location.href = "/mfa/verify";
            return;
          }
          setSetupData(data.data);
        }
        setAuthenticated(true);
      } catch {
        window.location.href = "/login";
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  const handlePasskeySuccess = useCallback(() => {
    // After passkey registration, session is already MFA-verified (API sets it)
    window.location.href = "/assessments";
  }, []);

  const handleTotpVerified = useCallback(() => {
    window.location.href = "/assessments";
  }, []);

  if (loading) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />

      {/* Phase 1: Method choice */}
      {selectedMethod === null && (
        <div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-foreground">
              Secure Your Account
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose how you&apos;d like to verify your identity when signing in.
            </p>
          </div>

          <div className="space-y-3">
            {/* Passkey option */}
            {isWebAuthnSupported && (
              <button
                onClick={() => setSelectedMethod("passkey")}
                className="w-full flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Passkey</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use your fingerprint, face, or device PIN. Fastest and most secure — no codes to type.
                  </p>
                </div>
              </button>
            )}

            {/* TOTP option */}
            <button
              onClick={() => setSelectedMethod("totp")}
              className="w-full flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Authenticator App</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use Google Authenticator, Authy, or similar app to generate 6-digit codes.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Phase 2a: Passkey registration */}
      {selectedMethod === "passkey" && (
        <div>
          <button
            onClick={() => setSelectedMethod(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-foreground">
              Register a Passkey
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your device will prompt you to use your fingerprint, face, or PIN.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-8 w-8 text-primary" />
            </div>
            <PasskeyRegistrationButton onSuccess={handlePasskeySuccess} />
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Your passkey is stored securely on your device and cannot be phished or stolen.
            </p>
          </div>
        </div>
      )}

      {/* Phase 2b: TOTP setup */}
      {selectedMethod === "totp" && (
        <div>
          <button
            onClick={() => setSelectedMethod(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-foreground">
              Set Up Authenticator App
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scan the QR code with your authenticator app, then enter the 6-digit code to verify.
            </p>
          </div>

          {setupData ? (
            <TotpSetupForm
              qrUri={setupData.uri}
              secret={setupData.secret}
              onVerified={handleTotpVerified}
            />
          ) : (
            <p className="text-sm text-destructive text-center">
              Failed to load setup data. Please refresh and try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
