"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/constants/ui-text";

interface TotpSetupFormProps {
  qrUri: string;
  secret: string;
  onVerified: () => void;
}

export function TotpSetupForm({ qrUri, secret, onVerified }: TotpSetupFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const response = await fetch("/api/auth/mfa/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, secret }),
        });

        const data: { data?: { success: boolean }; error?: { message: string } } =
          await response.json();

        if (!response.ok) {
          setError(data.error?.message ?? "Verification failed");
          return;
        }

        onVerified();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [code, secret, onVerified],
  );

  // Generate a QR code URL using a public QR code API
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrImageUrl}
          alt="Scan this QR code with your authenticator app"
          width={200}
          height={200}
          className="rounded-lg border"
        />
      </div>

      <div className="bg-muted/40 rounded-lg p-4">
        <p className="text-sm text-muted-foreground mb-1">
          {UI_TEXT.auth.mfaManualEntry}
        </p>
        <code className="text-sm font-mono text-foreground break-all select-all">
          {secret}
        </code>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="totp-code" className="block text-sm font-medium text-foreground mb-1">
            {UI_TEXT.auth.mfaVerifyDescription}
          </label>
          <Input
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={UI_TEXT.auth.mfaCodePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl tracking-[0.5em] font-mono"
            aria-describedby={error ? "totp-error" : undefined}
          />
          {error && (
            <p id="totp-error" className="text-sm text-destructive mt-1">
              {error}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-11"
          disabled={code.length !== 6 || loading}
        >
          {loading ? "Verifying..." : UI_TEXT.auth.mfaSetupButton}
        </Button>
      </form>
    </div>
  );
}
