"use client";

import { useState, useCallback } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { humanizeWebAuthnError } from "@/lib/errors";

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
        toast.error("Failed to start passkey registration. Please try again.");
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
        toast.error("Passkey registration failed. Please try again.");
        return;
      }

      toast.success("Passkey registered successfully");
      onSuccess?.();
    } catch (err) {
      const friendlyMessage = humanizeWebAuthnError(err);
      // null means silent (user cancelled)
      if (friendlyMessage) {
        toast.error(friendlyMessage);
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
