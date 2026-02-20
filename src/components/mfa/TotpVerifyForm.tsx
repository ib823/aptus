"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/constants/ui-text";

interface TotpVerifyFormProps {
  onVerified: () => void;
}

export function TotpVerifyForm({ onVerified }: TotpVerifyFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const inputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for TOTP period
  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      setCountdown(30 - (now % 30));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const response = await fetch("/api/auth/mfa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const data: { data?: { success: boolean }; error?: { message: string } } =
          await response.json();

        if (!response.ok) {
          setError(data.error?.message ?? "Verification failed");
          setCode("");
          inputRef.current?.focus();
          return;
        }

        onVerified();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [code, onVerified],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="verify-code" className="block text-sm font-medium text-gray-700 mb-1">
          {UI_TEXT.auth.mfaVerifyDescription}
        </label>
        <Input
          ref={inputRef}
          id="verify-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={UI_TEXT.auth.mfaCodePlaceholder}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="text-center text-2xl tracking-[0.5em] font-mono"
          aria-describedby={error ? "verify-error" : undefined}
        />
        {error && (
          <p id="verify-error" className="text-sm text-red-500 mt-1">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Code refreshes in{" "}
          <span className="font-mono font-medium text-gray-700">
            {countdown}s
          </span>
        </span>
      </div>

      <Button
        type="submit"
        className="w-full h-11"
        disabled={code.length !== 6 || loading}
      >
        {loading ? "Verifying..." : UI_TEXT.auth.mfaVerifyButton}
      </Button>
    </form>
  );
}
