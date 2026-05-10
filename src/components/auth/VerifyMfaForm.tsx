"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeWebAuthnError } from "@/lib/errors";

interface VerifyMfaFormProps {
  /** Sanitized same-origin path the user was trying to reach. */
  next: string;
}

export function VerifyMfaForm({ next }: VerifyMfaFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/webauthn/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!optionsRes.ok) {
        setError("Couldn't start verification. Please try again.");
        return;
      }
      const { data: options } = (await optionsRes.json()) as {
        data: PublicKeyCredentialRequestOptionsJSON;
      };

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authResponse }),
      });

      if (!verifyRes.ok) {
        setError("Verification failed. Try again or contact support.");
        return;
      }

      // Verify succeeded; the verify route marked the new session mfaVerified
      // and rotated the session cookie. Hard-navigate (not router.push) so the
      // browser sends the new cookie with the next request to `next`.
      window.location.assign(next);
    } catch (err) {
      const friendly = humanizeWebAuthnError(err);
      // null means user cancelled — leave the panel as-is so they can retry.
      if (friendly) setError(friendly);
    } finally {
      setIsPending(false);
    }
  }, [next]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          <CardTitle>Verify with your passkey</CardTitle>
        </div>
        <CardDescription>
          Your organization requires a second factor for this session. Confirm
          with the passkey on this device to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <Button onClick={handleVerify} disabled={isPending} className="w-full">
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Fingerprint className="w-4 h-4 mr-2" />
          )}
          {isPending ? "Verifying…" : "Verify with passkey"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Lost your device? Sign out from the menu and use a magic link to
          recover, then enroll a new passkey under <em>Settings → Security</em>.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/login?signOut=1")}
          className="w-full"
        >
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
