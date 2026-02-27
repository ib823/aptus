"use client";

import { useState, useCallback } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PasskeyRegistrationButtonProps {
  onSuccess?: () => void;
}

export function PasskeyRegistrationButton({ onSuccess }: PasskeyRegistrationButtonProps) {
  const [isPending, setIsPending] = useState(false);

  const handleRegister = useCallback(async () => {
    setIsPending(true);
    try {
      // Step 1: Get registration options
      const optionsRes = await fetch("/api/auth/webauthn/register/options");
      if (!optionsRes.ok) {
        const err = await optionsRes.json().catch(() => ({}));
        toast.error(err?.error?.message ?? "Failed to start passkey registration");
        return;
      }

      const { data: options } = (await optionsRes.json()) as {
        data: PublicKeyCredentialCreationOptionsJSON;
      };

      // Step 2: Create credential with browser
      const regResponse = await startRegistration({ optionsJSON: options });

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: regResponse }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        toast.error(err?.error?.message ?? "Passkey registration failed");
        return;
      }

      toast.success("Passkey registered successfully");
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Passkey registration failed";
      if (!message.includes("cancelled") && !message.includes("canceled") && !message.includes("AbortError")) {
        toast.error(message);
      }
    } finally {
      setIsPending(false);
    }
  }, [onSuccess]);

  return (
    <Button onClick={handleRegister} disabled={isPending}>
      {isPending ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <KeyRound className="w-4 h-4 mr-2" />
      )}
      {isPending ? "Registering..." : "Add passkey"}
    </Button>
  );
}
