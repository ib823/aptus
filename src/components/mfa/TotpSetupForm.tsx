"use client";

import { useState, useCallback, useEffect } from "react";
import QRCode from "qrcode";
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
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);

  // Render the QR locally from the otpauth:// URI. The URI embeds the raw TOTP
  // seed, so it must never leave the browser — an earlier version passed it to a
  // third-party image API (api.qrserver.com), which exposed the shared secret to
  // that host and anyone observing the request.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrUri, { width: 200, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setQrDataUri(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not render the QR code. Use the manual key below.");
      });
    return () => {
      cancelled = true;
    };
  }, [qrUri]);

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

        if (!response.ok) {
          setError("Verification failed. Please check the code and try again.");
          return;
        }

        await response.json();
        onVerified();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [code, secret, onVerified],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center">
        {qrDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUri}
            alt="Scan this QR code with your authenticator app"
            width={200}
            height={200}
            className="rounded-lg border"
          />
        ) : (
          <div
            className="rounded-lg border bg-muted/40 flex items-center justify-center"
            style={{ width: 200, height: 200 }}
            aria-label="Generating QR code"
          />
        )}
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
