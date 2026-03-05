"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ABeamLogo } from "@/components/shared/ABeamLogo";

interface AcceptResult {
  user: { id: string; email: string; name: string; role: string };
  organization: { id: string; name: string };
}

export default function InvitationAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setErrorMessage("Invalid invitation link");
      setStatus("error");
      return;
    }

    async function acceptInvitation() {
      try {
        const res = await fetch(`/api/invitations/${token}/accept`, {
          method: "POST",
        });

        if (res.ok) {
          const data = await res.json();
          setResult(data.data);
          setStatus("success");
          setTimeout(() => router.push("/login"), 3000);
        } else {
          const data = await res.json();
          setErrorMessage(data.error?.message ?? "Failed to accept invitation");
          setStatus("error");
        }
      } catch {
        setErrorMessage("Network error. Please try again.");
        setStatus("error");
      }
    }

    acceptInvitation();
  }, [token, router]);

  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <ABeamLogo className="mx-auto mb-4" />
      </CardHeader>
      <CardContent className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Accepting your invitation...</p>
          </>
        )}

        {status === "success" && result && (
          <>
            <CheckCircle className="w-10 h-10 text-green-600 mx-auto" />
            <h2 className="text-lg font-semibold">Welcome to {result.organization.name}!</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been added as a <strong>{result.user.role.replace(/_/g, " ")}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">Redirecting to sign in...</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/login")}>
              Sign in now
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h2 className="text-lg font-semibold">Invitation Error</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/login")}>
              Go to sign in
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
