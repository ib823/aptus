"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

interface UseWebAuthnLoginReturn {
  isSupported: boolean;
  isConditionalSupported: boolean;
  authenticate: (email?: string) => Promise<{ success: boolean; error?: string }>;
  isPending: boolean;
}

export function useWebAuthnLogin(): UseWebAuthnLoginReturn {
  const router = useRouter();
  const [isSupported, setIsSupported] = useState(false);
  const [isConditionalSupported, setIsConditionalSupported] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    // Check WebAuthn support
    const supported =
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined";
    setIsSupported(supported);

    if (supported) {
      // Check conditional mediation (autofill) support
      PublicKeyCredential.isConditionalMediationAvailable?.()
        .then((available) => setIsConditionalSupported(available))
        .catch(() => setIsConditionalSupported(false));
    }
  }, []);

  const authenticate = useCallback(
    async (email?: string): Promise<{ success: boolean; error?: string }> => {
      setIsPending(true);
      try {
        // Step 1: Get authentication options
        const optionsRes = await fetch(
          "/api/auth/webauthn/authenticate/options",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(email ? { email } : {}),
          },
        );

        if (!optionsRes.ok) {
          const err = await optionsRes.json().catch(() => ({}));
          return {
            success: false,
            error: err?.error?.message ?? "Failed to get authentication options",
          };
        }

        const { data: options } = (await optionsRes.json()) as {
          data: PublicKeyCredentialRequestOptionsJSON;
        };

        // Step 2: Start authentication with browser
        const authResponse = await startAuthentication({ optionsJSON: options });

        // Step 3: Verify with server
        const verifyRes = await fetch(
          "/api/auth/webauthn/authenticate/verify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ response: authResponse }),
          },
        );

        if (!verifyRes.ok) {
          const err = await verifyRes.json().catch(() => ({}));
          return {
            success: false,
            error: err?.error?.message ?? "Authentication failed",
          };
        }

        const { data } = (await verifyRes.json()) as {
          data: { success: boolean; redirectUrl: string };
        };

        // Session cookie is set by API — redirect
        router.push(data.redirectUrl);
        return { success: true };
      } catch (err) {
        // User cancelled or browser error
        const message =
          err instanceof Error ? err.message : "Passkey authentication failed";
        // Don't show error for user cancellation
        if (message.includes("cancelled") || message.includes("canceled") || message.includes("AbortError")) {
          return { success: false };
        }
        return { success: false, error: message };
      } finally {
        setIsPending(false);
      }
    },
    [router],
  );

  return { isSupported, isConditionalSupported, authenticate, isPending };
}
