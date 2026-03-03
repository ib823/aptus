"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { humanizeWebAuthnError } from "@/lib/errors";

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
          return {
            success: false,
            error: "Failed to start passkey sign-in. Please try again.",
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
          return {
            success: false,
            error: "Passkey authentication failed. Please try again.",
          };
        }

        const { data } = (await verifyRes.json()) as {
          data: { success: boolean; redirectUrl: string };
        };

        // Session cookie is set by API — redirect
        router.push(data.redirectUrl);
        return { success: true };
      } catch (err) {
        // Map browser WebAuthn errors to user-friendly messages
        const friendlyMessage = humanizeWebAuthnError(err);
        // null means silent (user cancelled) — don't show error
        if (!friendlyMessage) {
          return { success: false };
        }
        return { success: false, error: friendlyMessage };
      } finally {
        setIsPending(false);
      }
    },
    [router],
  );

  return { isSupported, isConditionalSupported, authenticate, isPending };
}
