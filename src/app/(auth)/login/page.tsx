"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, AlertCircle, ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AptusLogo } from "@/components/shared/AptusLogo";
import { UI_TEXT } from "@/constants/ui-text";
import { signIn } from "next-auth/react";
import { useWebAuthnLogin } from "@/hooks/useWebAuthnLogin";

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get("verify") === "true";
  const isError = searchParams.get("error") === "true";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(isVerify);
  const [sentEmail, setSentEmail] = useState("");
  const errorParam = searchParams.get("error");
  const [error, setError] = useState(() => {
    if (!isError && !errorParam) return "";
    if (errorParam === "Verification") return "This sign-in link has expired or already been used. Enter your email to receive a new one.";
    if (errorParam === "AccessDenied") return "Access denied. Your account may not have permission to sign in.";
    if (errorParam === "Configuration") return "There is a configuration issue. Please contact support.";
    return "Sign-in failed. Please check your email and try again.";
  });
  const [resendCooldown, setResendCooldown] = useState(0);
  const { isSupported: passkeySupported, authenticate: passkeyAuth, isPending: passkeyPending } = useWebAuthnLogin();

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      try {
        const result = await signIn("email", {
          email,
          redirect: false,
          callbackUrl: "/api/auth/bridge?callbackUrl=/assessments",
        });

        if (result?.error) {
          if (result.status === 429) {
            setError("Too many login attempts. Please wait a minute and try again.");
          } else {
            setError("Failed to send magic link. Please try again.");
          }
          setLoading(false);
          return;
        }

        setSentEmail(email);
        setSent(true);
        setResendCooldown(60);
      } catch {
        setError("Something went wrong. Please check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [email],
  );

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || !sentEmail) return;
    setLoading(true);
    try {
      await signIn("email", {
        email: sentEmail,
        redirect: false,
        callbackUrl: "/api/auth/bridge?callbackUrl=/assessments",
      });
      setResendCooldown(60);
    } catch {
      setError("Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [sentEmail, resendCooldown]);

  const handlePasskeyLogin = useCallback(async () => {
    setError("");
    const result = await passkeyAuth();
    if (result.error) {
      setError(result.error);
    }
  }, [passkeyAuth]);

  const handleBackToLogin = useCallback(() => {
    setSent(false);
    setSentEmail("");
    setError("");
  }, []);

  return (
    <Card className="rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CardHeader className="text-center pb-2">
        <AptusLogo size="lg" className="mb-2 justify-center" />
        <p className="text-xs text-muted-foreground mb-4">
          {UI_TEXT.app.tagline}
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          {sent ? UI_TEXT.auth.magicLinkSent : UI_TEXT.auth.loginTitle}
        </h1>
        {!sent && (
          <p className="text-base text-muted-foreground mt-1">
            {UI_TEXT.auth.loginSubtitle}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-center py-4">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <p className="text-sm text-muted-foreground text-center mb-6">
              {UI_TEXT.auth.magicLinkDescription}
            </p>
            <div className="flex flex-col items-center gap-3 w-full">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
              >
                {resendCooldown > 0
                  ? `Resend link in ${resendCooldown}s`
                  : loading
                    ? "Sending..."
                    : "Resend link"}
              </Button>
              <button
                onClick={handleBackToLogin}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Wrong email? Try again
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-1 text-left">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={UI_TEXT.auth.emailPlaceholder}
                  className="pl-10 h-11"
                  required
                  autoFocus
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11"
              disabled={!email || loading}
              aria-disabled={!email || loading}
            >
              {loading ? "Sending..." : UI_TEXT.auth.sendMagicLink}
            </Button>
            {passkeySupported && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyPending}
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  {passkeyPending ? "Authenticating..." : "Sign in with passkey"}
                </Button>
              </>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <a href="/signup" className="text-primary hover:underline">
                Sign up
              </a>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
