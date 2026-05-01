"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, AlertCircle, ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UI_TEXT } from "@/constants/ui-text";
import { signIn } from "next-auth/react";
import { useWebAuthnLogin } from "@/hooks/useWebAuthnLogin";

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams?.get("verify") === "true";
  const isError = searchParams?.get("error") === "true";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(isVerify);
  const [sentEmail, setSentEmail] = useState("");
  const errorParam = searchParams?.get("error");
  const [error, setError] = useState(() => {
    if (!isError && !errorParam) return "";
    if (errorParam === "Verification") return "This sign-in link has expired or already been used. Enter your email to receive a new one.";
    if (errorParam === "AccessDenied") return "Access restricted. Please use an authorized company email or request an invitation from your administrator.";
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
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Mobile-only logo */}
      <ABeamLogo size="lg" className="mb-6 justify-center lg:hidden" />

      {sent ? (
        /* Magic link sent confirmation */
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
            {UI_TEXT.auth.magicLinkSent}
          </h1>
          <div className="flex flex-col items-center py-6">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            {sentEmail && (
              <p className="text-sm font-medium text-foreground text-center mb-2">
                {sentEmail}
              </p>
            )}
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
        </div>
      ) : (
        /* Default sign-in form */
        <div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-foreground">
              {UI_TEXT.auth.loginTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {UI_TEXT.auth.loginSubtitle}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-6">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Passkey — always visible, primary CTA */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">
                    <Button
                      type="button"
                      className="w-full h-11"
                      onClick={handlePasskeyLogin}
                      disabled={passkeyPending || !passkeySupported}
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      {passkeyPending ? "Authenticating..." : "Sign in with passkey"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!passkeySupported && (
                  <TooltipContent>
                    Your browser does not support passkeys. Use a modern browser like Chrome, Safari, or Edge.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or continue with email
                </span>
              </div>
            </div>

            {/* Email magic link form */}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                variant="outline"
                className="w-full h-11"
                disabled={!email || loading}
              >
                {loading ? "Sending..." : UI_TEXT.auth.sendMagicLink}
              </Button>
            </form>

            {/* Sign up link */}
            <p className="text-center text-sm text-muted-foreground pt-2">
              Don&apos;t have an account?{" "}
              <a
                href="/signup"
                className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
              >
                Sign up
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
